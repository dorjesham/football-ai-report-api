import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GptImage2Client {
  constructor(private readonly config: ConfigService) {}

  /** 返回图片 URL（OpenAI Images 兼容 JSON：data[0].url） */
  async generateImageUrl(prompt: string): Promise<string> {
    if (this.config.get<boolean>('enablePosterImageMock') === true) {
      const q = encodeURIComponent(prompt.slice(0, 80));
      return `https://placehold.co/1024x1024/png/0f172a/e2e8f0?text=${q}`;
    }

    const base = (this.config.get<string>('gptImage2BaseUrl') || '').replace(/\/$/, '');
    const key = this.config.get<string>('gptImage2ApiKey');
    const path = this.config.get<string>('gptImage2Path') || '/v1/images/generations';
    const model = this.config.get<string>('gptImage2Model') || 'gpt-image-2';

    if (!base || !key) {
      throw new ServiceUnavailableException(
        '图像接口未配置：请设置 GPT_IMAGE2_BASE_URL 与 GPT_IMAGE2_API_KEY，或开启 ENABLE_POSTER_IMAGE_MOCK=true 使用占位图',
      );
    }

    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const { data } = await axios.post<{
        data?: Array<{ url?: string; b64_json?: string }>;
        error?: { message?: string };
      }>(
        url,
        {
          model,
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'url',
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: 180000,
        },
      );

      const u = data?.data?.[0]?.url;
      if (u) return u;
      if (data?.data?.[0]?.b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      }
      throw new Error(data?.error?.message || 'empty image response');
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e)
        ? e.response?.data?.error?.message || e.message
        : String(e);
      throw new ServiceUnavailableException(`图像接口调用失败: ${msg}`);
    }
  }
}
