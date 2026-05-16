import { createDecipheriv, createSign, createVerify, randomBytes } from 'crypto';

/** 微信支付 API v3：商户请求签名 Authorization 头 */
export function buildMerchantAuthorization(opts: {
  mchid: string;
  serialNo: string;
  privateKeyPem: string;
  method: string;
  urlPath: string;
  body: string;
}): { authorization: string; timestamp: string; nonceStr: string } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomBytes(16).toString('hex');
  const message = `${opts.method.toUpperCase()}\n${opts.urlPath}\n${timestamp}\n${nonceStr}\n${opts.body}\n`;
  const sign = createSign('RSA-SHA256')
    .update(message)
    .sign(opts.privateKeyPem, 'base64');
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${opts.mchid}",nonce_str="${nonceStr}",` +
    `signature="${sign}",timestamp="${timestamp}",serial_no="${opts.serialNo}"`;
  return { authorization, timestamp, nonceStr };
}

/** 校验回调 Wechatpay-Signature（对 `timestamp\nnonce\nbody\n` 验签） */
export function verifyWechatpaySignature(opts: {
  platformPublicKeyPem: string;
  timestamp: string;
  nonce: string;
  body: string;
  signatureBase64: string;
}): boolean {
  const message = `${opts.timestamp}\n${opts.nonce}\n${opts.body}\n`;
  try {
    return createVerify('RSA-SHA256')
      .update(message)
      .verify(opts.platformPublicKeyPem, opts.signatureBase64, 'base64');
  } catch {
    return false;
  }
}

/**
 * 解密 resource（TRANSACTION.SUCCESS 等回调体）。
 * API v3 Key 须为 32 字节；ciphertext 含 16 字节 auth tag。
 */
export function decryptResourceAesGcm(
  apiV3Key: string,
  associatedData: string,
  nonce: string,
  ciphertextBase64: string,
): string {
  const key = Buffer.from(apiV3Key, 'utf8');
  if (key.length !== 32) {
    throw new Error('WX_PAY_API_V3_KEY must be 32 bytes');
  }
  const buf = Buffer.from(ciphertextBase64, 'base64');
  if (buf.length < 17) throw new Error('ciphertext too short');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const iv = Buffer.from(nonce, 'utf8');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData ?? '', 'utf8'));
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 小程序调起支付：RSA-SHA256 签名（v3） */
export function buildMiniProgramPaySign(opts: {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  packageStr: string;
  privateKeyPem: string;
}): string {
  const message = `${opts.appId}\n${opts.timeStamp}\n${opts.nonceStr}\n${opts.packageStr}\n`;
  return createSign('RSA-SHA256').update(message).sign(opts.privateKeyPem, 'base64');
}
