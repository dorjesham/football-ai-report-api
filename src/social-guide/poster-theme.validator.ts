import { BadRequestException } from '@nestjs/common';

/** 须命中至少一类足球相关表述（中英），防明显跑题。 */
const FOOTBALL_PATTERN =
  /足球|球场|俱乐部|球星|欧冠|世界杯|英超|西甲|德甲|意甲|法甲|国家队|主教练|教练|射手|门将|德比|球迷|世界杯|欧洲杯|美洲杯|亚洲杯|足总杯|联赛杯|美职联|MLS|FIFA|UEFA|进球|射门|点球|角球|红黄牌|阵容|战术|转会|青训|世界杯预选赛|世预赛|football|soccer|stadium|club|player|coach|national|world cup|champions|premier|la liga|bundesliga|serie a|ligue|match/i;

export function assertFootballPosterTheme(customElements: string): string {
  const s = (customElements || '').trim();
  if (s.length < 2 || s.length > 120) {
    throw new BadRequestException('自定义主元素长度需在 2～120 字以内');
  }
  if (!FOOTBALL_PATTERN.test(s)) {
    throw new BadRequestException(
      '自定义主元素须与足球相关（例如：俱乐部名、球星、球场、国家队、主教练等）',
    );
  }
  return s;
}

export function buildPosterPrompt(params: {
  homeCn: string;
  awayCn: string;
  homeEn: string;
  awayEn: string;
  userTheme: string;
}): string {
  return [
    'Design a square 1:1 social sharing poster image for a football match preview.',
    'Style: bold modern sports graphic, high contrast, no betting logos, no QR codes, no real sponsor trademarks.',
    `Match: ${params.homeEn} vs ${params.awayEn} (${params.homeCn} vs ${params.awayCn}).`,
    `User requested visual emphasis (football-related only): ${params.userTheme}.`,
    'Do not add disclaimer text, legal fine print, footer slogans, or betting-related warnings anywhere on the image.',
    'No text longer than a short headline on the image; keep typography minimal.',
  ].join(' ');
}
