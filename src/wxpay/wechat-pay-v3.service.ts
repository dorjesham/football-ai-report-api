import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import { readFileSync } from 'fs';
import { X509Certificate } from 'crypto';
import {
  buildMerchantAuthorization,
  buildMiniProgramPaySign,
  decryptResourceAesGcm,
  verifyWechatpaySignature,
} from './wechat-pay-v3.crypto';

const JSAPI_PATH = '/v3/pay/transactions/jsapi';
const CERTS_PATH = '/v3/certificates';
const WXPAY_HOST = 'https://api.mch.weixin.qq.com';

type JsapiResponse = { prepay_id?: string };

@Injectable()
export class WechatPayV3Service {
  private readonly log = new Logger(WechatPayV3Service.name);
  /** serial_no → SPKI PEM（用于回调验签） */
  private platformPubPemBySerial = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  private loadMerchantPrivateKeyPem(): string {
    const p = this.config.get<string>('wxPayPrivateKeyPath');
    if (!p?.trim()) throw new ServiceUnavailableException('WX_PAY_PRIVATE_KEY_PATH missing');
    try {
      return readFileSync(p.trim(), 'utf8');
    } catch (e) {
      this.log.warn(`read merchant private key failed: ${String(e)}`);
      throw new ServiceUnavailableException('无法读取微信支付商户私钥文件');
    }
  }

  private merchantAuthHeaders(
    method: string,
    path: string,
    body: string,
    opts?: { includeJsonContentType?: boolean },
  ) {
    const mchid = this.config.get<string>('wxPayMchId')!;
    const serial = this.config.get<string>('wxPaySerialNo')!;
    const pem = this.loadMerchantPrivateKeyPem();
    const { authorization } = buildMerchantAuthorization({
      mchid,
      serialNo: serial,
      privateKeyPem: pem,
      method,
      urlPath: path,
      body,
    });
    const h: Record<string, string> = {
      Authorization: authorization,
      Accept: 'application/json',
      'User-Agent': 'football-ai-report-api/1',
    };
    if (opts?.includeJsonContentType !== false && method.toUpperCase() !== 'GET') {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  /**
   * JSAPI 下单，返回 prepay_id 与小程序调起支付参数。
   */
  async createJsapiOrderAndPayParams(opts: {
    description: string;
    outTradeNo: string;
    amountCents: number;
    openid: string;
  }): Promise<{
    prepayId: string;
    payParams: {
      appId: string;
      timeStamp: string;
      nonceStr: string;
      package: string;
      signType: 'RSA';
      paySign: string;
    };
  }> {
    const appId = this.config.get<string>('wxPayAppId')!;
    const mchId = this.config.get<string>('wxPayMchId')!;
    const notifyUrl = this.config.get<string>('wxPayNotifyUrl');
    if (!notifyUrl?.trim()) {
      throw new ServiceUnavailableException('WX_PAY_NOTIFY_URL 未配置，无法下单');
    }
    const bodyObj = {
      appid: appId,
      mchid: mchId,
      description: opts.description.slice(0, 127),
      out_trade_no: opts.outTradeNo,
      notify_url: notifyUrl.trim(),
      amount: { total: opts.amountCents, currency: 'CNY' },
      payer: { openid: opts.openid },
    };
    const body = JSON.stringify(bodyObj);
    const url = `${WXPAY_HOST}${JSAPI_PATH}`;
    try {
      const { data } = await axios.post<JsapiResponse>(url, body, {
        headers: {
          ...this.merchantAuthHeaders('POST', JSAPI_PATH, body),
          'Content-Type': 'application/json',
        },
        timeout: 20_000,
      });
      const prepayId = data?.prepay_id;
      if (!prepayId || typeof prepayId !== 'string') {
        throw new Error(`unexpected jsapi response: ${JSON.stringify(data).slice(0, 400)}`);
      }
      const timeStamp = String(Math.floor(Date.now() / 1000));
      const nonceStr = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
      const pkg = `prepay_id=${prepayId}`;
      const paySign = buildMiniProgramPaySign({
        appId,
        timeStamp,
        nonceStr,
        packageStr: pkg,
        privateKeyPem: this.loadMerchantPrivateKeyPem(),
      });
      return {
        prepayId,
        payParams: {
          appId,
          timeStamp,
          nonceStr,
          package: pkg,
          signType: 'RSA',
          paySign,
        },
      };
    } catch (e) {
      const msg = isAxiosError(e)
        ? `${e.response?.status} ${JSON.stringify(e.response?.data || e.message).slice(0, 600)}`
        : e instanceof Error
          ? e.message
          : String(e);
      this.log.warn(`jsapi order failed: ${msg}`);
      throw new ServiceUnavailableException(`微信 JSAPI 下单失败: ${msg}`);
    }
  }

  /** 拉取平台证书并缓存公钥（用于生产回调验签） */
  async refreshPlatformCertificates(): Promise<{ loaded: number }> {
    const apiV3Key = this.config.get<string>('wxPayApiV3Key');
    if (!apiV3Key || Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
      throw new ServiceUnavailableException('WX_PAY_API_V3_KEY 须为 32 位');
    }
    const signPath = CERTS_PATH;
    const body = '';
    const url = `${WXPAY_HOST}${CERTS_PATH}`;
    const { data } = await axios.get<{
      data?: Array<{
        serial_no?: string;
        encrypt_certificate?: {
          associated_data?: string;
          nonce?: string;
          ciphertext?: string;
        };
      }>;
    }>(url, {
      headers: this.merchantAuthHeaders('GET', signPath, body, {
        includeJsonContentType: false,
      }),
      timeout: 20_000,
    });
    const rows = Array.isArray(data?.data) ? data.data : [];
    let loaded = 0;
    for (const row of rows) {
      const serial = typeof row.serial_no === 'string' ? row.serial_no.trim() : '';
      const enc = row.encrypt_certificate;
      if (!serial || !enc?.ciphertext || !enc.nonce) continue;
      const ad = typeof enc.associated_data === 'string' ? enc.associated_data : 'certificate';
      const pem = decryptResourceAesGcm(apiV3Key, ad, enc.nonce, enc.ciphertext);
      try {
        const x509 = new X509Certificate(pem);
        const pub = x509.publicKey.export({ type: 'spki', format: 'pem' }) as string;
        this.platformPubPemBySerial.set(serial, pub);
        loaded += 1;
      } catch (err) {
        this.log.warn(`skip cert serial=${serial}: ${String(err)}`);
      }
    }
    return { loaded };
  }

  async ensurePlatformPubForSerial(serial: string): Promise<string | null> {
    const cached = this.platformPubPemBySerial.get(serial);
    if (cached) return cached;
    const envPem = this.config.get<string>('wxPayPlatformPublicKeyPem')?.trim();
    if (envPem) {
      this.platformPubPemBySerial.set(serial, envPem);
      return envPem;
    }
    try {
      await this.refreshPlatformCertificates();
    } catch (e) {
      this.log.warn(`refresh platform certs: ${String(e)}`);
      return null;
    }
    return this.platformPubPemBySerial.get(serial) ?? null;
  }

  /**
   * 默认始终验签 + 解密（与生产一致）。
   * 仅非 production 且 `WXPAY_NOTIFY_SKIP_VERIFY=true` 时跳过（本地假回调）；production 永不跳过。
   */
  async verifyNotifyAndDecrypt(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    parsedBody: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string; plain?: Record<string, unknown> }> {
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    const allowSkip =
      !isProd && this.config.get<boolean>('wxpayNotifySkipVerify') === true;
    if (allowSkip) {
      return { ok: true, message: 'dev_skip_verify_explicit', plain: parsedBody };
    }

    const sig = String(headers['wechatpay-signature'] || '');
    const ts = String(headers['wechatpay-timestamp'] || '');
    const nonce = String(headers['wechatpay-nonce'] || '');
    const serial = String(headers['wechatpay-serial'] || '');
    if (!sig || !ts || !nonce || !serial) {
      return { ok: false, message: 'missing_wechatpay_v3_headers' };
    }

    const envPem = this.config.get<string>('wxPayPlatformPublicKeyPem')?.trim();
    const pubPem = envPem || (await this.ensurePlatformPubForSerial(serial));
    if (!pubPem) {
      return {
        ok: false,
        message: 'platform_public_key_unavailable',
      };
    }
    const okSig = verifyWechatpaySignature({
      platformPublicKeyPem: pubPem,
      timestamp: ts,
      nonce,
      body: rawBody,
      signatureBase64: sig,
    });
    if (!okSig) {
      return { ok: false, message: 'invalid_signature' };
    }

    const resource = parsedBody.resource as
      | {
          algorithm?: string;
          associated_data?: string;
          ciphertext?: string;
          nonce?: string;
        }
      | undefined;
    if (resource?.ciphertext && resource.nonce) {
      const apiV3Key = this.config.get<string>('wxPayApiV3Key');
      if (!apiV3Key || Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
        return { ok: false, message: 'api_v3_key_invalid' };
      }
      const ad =
        typeof resource.associated_data === 'string' && resource.associated_data.length ?
          resource.associated_data
        : 'transaction';
      try {
        const json = decryptResourceAesGcm(
          apiV3Key,
          ad,
          resource.nonce,
          resource.ciphertext,
        );
        const plain = JSON.parse(json) as Record<string, unknown>;
        return { ok: true, message: 'decrypted', plain };
      } catch (e) {
        return { ok: false, message: `decrypt_fail:${String(e)}` };
      }
    }

    return { ok: true, message: 'plaintext_body', plain: parsedBody };
  }
}
