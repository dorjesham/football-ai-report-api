import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataQuality, DataSourceType } from '@prisma/client';
import axios, { isAxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatAxiosQWeatherFailure,
  qweatherApiKeyHeaders,
} from './qweather-http.util';

@Injectable()
export class WeatherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async syncForMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');

    const key = this.config.get<string>('qweatherApiKey');
    const base =
      this.config.get<string>('qweatherBaseUrl')?.replace(/\/$/, '') ||
      'https://devapi.qweather.com';
    if (!key) {
      throw new BadRequestException('QWeather API Key 未配置');
    }

    const city = match.city || match.country || 'Beijing';
    const isChinese = /[\u4e00-\u9fff]/.test(city);
    const headers = qweatherApiKeyHeaders(key);

    try {
      const geoUrl = `${base}/geo/v2/city/lookup`;
      const { data: geo } = await axios.get<{
        code?: string;
        location?: Array<{ id?: string }>;
      }>(geoUrl, {
        params: {
          location: city,
          ...(isChinese ? { range: 'cn' } : {}),
        },
        headers,
        timeout: 12000,
      });
      if (geo?.code && geo.code !== '200') {
        throw new Error(`和风 GeoAPI 返回 code=${geo.code}（请检查 Key、订阅与 QWEATHER_BASE_URL）`);
      }
      const locationId = geo?.location?.[0]?.id;
      if (!locationId) {
        throw new Error('No location id');
      }

      const wxUrl = `${base}/v7/weather/now`;
      const { data: wx } = await axios.get<{ code?: string; now?: Record<string, unknown> }>(
        wxUrl,
        {
          params: { location: locationId },
          headers,
          timeout: 12000,
        },
      );
      if (wx?.code && wx.code !== '200') {
        throw new Error(`和风实况返回 code=${wx.code}`);
      }
      const now = wx?.now;
      return this.prisma.weatherSnapshot.upsert({
        where: { matchId },
        create: {
          matchId,
          temperature: now?.temp ? parseFloat(String(now.temp)) : undefined,
          condition: now?.text as string | undefined,
          humidity: now?.humidity ? parseFloat(String(now.humidity)) : undefined,
          windSpeed: now?.windSpeed ? parseFloat(String(now.windSpeed)) : undefined,
          visibility: now?.vis ? parseFloat(String(now.vis)) : undefined,
          dataQuality: DataQuality.PUBLIC_DATA,
          dataSource: DataSourceType.QWEATHER,
        },
        update: {
          temperature: now?.temp ? parseFloat(String(now.temp)) : undefined,
          condition: now?.text as string | undefined,
          humidity: now?.humidity ? parseFloat(String(now.humidity)) : undefined,
          windSpeed: now?.windSpeed ? parseFloat(String(now.windSpeed)) : undefined,
          visibility: now?.vis ? parseFloat(String(now.vis)) : undefined,
        },
      });
    } catch (e) {
      let detail = e instanceof Error ? e.message : String(e);
      if (isAxiosError(e) && e.response?.status) {
        detail = formatAxiosQWeatherFailure(e, base, e.config?.url?.split('?')[0] ?? '');
      }
      throw new BadRequestException(`天气同步失败: ${detail}`);
    }
  }
}
