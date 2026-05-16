import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** 跳过统一 JSON 封装（用于 EJS / 原始响应） */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
