import { ConfigService } from '@nestjs/config';

/**
 * 与 {@link DeepseekService.generateReportJson} 一致：无 Key 或显式开启 mock 时走占位逻辑。
 */
export function shouldUseDeepseekMock(config: ConfigService): boolean {
  const key = config.get<string>('deepseekApiKey');
  if (!key?.trim()) return true;
  return config.get<boolean>('enableMockDeepseek') === true;
}
