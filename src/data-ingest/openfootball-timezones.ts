/** OpenFootball 文件键 → IANA 时区（开球按当地墙钟再转 UTC） */
export const OPENFOOTBALL_LEAGUE_TIMEZONES: Record<string, string> = {
  'en.1': 'Europe/London',
  'en.2': 'Europe/London',
  'de.1': 'Europe/Berlin',
  'es.1': 'Europe/Madrid',
  'it.1': 'Europe/Rome',
  'fr.1': 'Europe/Paris',
  'nl.1': 'Europe/Amsterdam',
  'pt.1': 'Europe/Lisbon',
};

/** GitHub raw 路径前缀（赛季目录按仓库维护情况调整） */
export function defaultOpenFootballRawUrl(leagueKey: string, seasonFolder: string): string {
  return `https://raw.githubusercontent.com/openfootball/football.json/master/${seasonFolder}/${leagueKey}.json`;
}
