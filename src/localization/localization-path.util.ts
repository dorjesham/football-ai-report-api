import { existsSync } from 'fs';
import { join } from 'path';

/** Resolve zh-CN seed/dictionary directory (dev root or dist copy). */
export function resolveLocalizationDataDir(): string {
  const candidates = [
    join(process.cwd(), 'data/localization/zh-CN'),
    join(process.cwd(), 'dist/data/localization/zh-CN'),
    join(__dirname, '..', '..', 'data', 'localization', 'zh-CN'),
    join(__dirname, '..', '..', '..', 'data', 'localization', 'zh-CN'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'football-dictionaries.json'))) return p;
  }
  return join(process.cwd(), 'data/localization/zh-CN');
}
