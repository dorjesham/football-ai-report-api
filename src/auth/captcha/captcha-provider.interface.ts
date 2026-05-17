export type CaptchaProviderName = 'svg' | 'geetest';

export type SvgCaptchaChallenge = {
  provider: 'svg';
  captchaId: string;
  imageBase64: string;
};

export type GeetestCaptchaChallenge = {
  provider: 'geetest';
  captchaId: string;
  lotNumber: string;
  captchaType?: string;
  failCount?: number;
  processToken?: string;
  payload?: string;
  payloadProtocol?: string;
  pt?: string;
  challenge?: string;
};

export type CaptchaChallenge = SvgCaptchaChallenge | GeetestCaptchaChallenge;

export type RegisterCaptchaVerifyInput = {
  captchaId: string;
  captchaCode?: string;
  lotNumber?: string;
  captchaOutput?: string;
  passToken?: string;
  genTime?: string;
};

export interface CaptchaProvider {
  readonly name: CaptchaProviderName;
  createChallenge(): Promise<CaptchaChallenge>;
  verify(input: RegisterCaptchaVerifyInput): Promise<void>;
}
