/**
 * football-data.org **Person id**（球员 / 裁判 / 教练共用数字 id）→ 常用中文名。
 * 与 {@link resolveFdTeamNameCn} 相同策略：表驱动扩展，未命中则回退英文名。
 *
 * 头像：FD v4 Person 资源通常不含图片字段；可在 {@link FD_PERSON_AVATAR_URL_BY_ID}
 * 中手工维护 CDN 地址，或由 {@link pickFirstHttpImageUrlFromUnknown} 从响应 JSON 中解析。
 */
export const FD_PERSON_NAME_CN_BY_ID: Record<string, string> = {
  // —— 教练（/teams coach.id）——
  '11630': '曼努埃尔·佩莱格里尼',

  // —— 裁判示例（英超）——
  '11580': '安东尼·泰勒',

  // —— 球员示例（阿森纳 / FD 2025–26 squad，可按需扩表）——
  '99813': '布卡约·萨卡',
  '80171': '威廉·萨利巴',
  '61450': '马丁内利',
  '23128': '加布里埃尔',
  '8984': '特罗萨德',
  '8215': '德克兰·赖斯',
  '7427': '马丁·厄德高',
  '6154': '本·怀特',
  '3236': '热苏斯',
  '171': '哈弗茨',
  '3189': '凯帕·阿里萨瓦拉加',
  '4832': '戴维·拉亚',
};

/** 可选：人物 id → 头像 URL（自建 CDN、版权合规图床等）。 */
export const FD_PERSON_AVATAR_URL_BY_ID: Record<string, string> = {};

export function resolveFdPersonNameCn(externalId: string, nameEn: string): string {
  const cn = FD_PERSON_NAME_CN_BY_ID[externalId];
  if (cn) return cn;
  return nameEn;
}

export function resolveFdPersonAvatarUrl(externalId: string): string | null {
  const u = FD_PERSON_AVATAR_URL_BY_ID[externalId];
  return typeof u === 'string' && u.trim().length > 0 ? u.trim() : null;
}
