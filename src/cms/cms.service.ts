import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';

export type CmsToolItem = {
  id: string;
  name: string;
  path: string;
  isPremium: boolean;
  icon?: string;
  description?: string;
};

export type CmsMaterialItem = {
  id: string;
  title: string;
  category: string;
  url?: string;
  isPremium: boolean;
};

export type CmsReportPreviewSection = {
  section: string;
  detail: string;
};

export type CmsReportItem = {
  id: string;
  title: string;
  summary: string;
  type: 'match' | 'season' | 'team' | 'player';
  league: string;
  tags: string[];
  pages?: number;
  confidence?: number;
  isPremium: boolean;
  publishedAt: string;
  category?: string;
  matchId?: string;
  preview?: CmsReportPreviewSection[];
};

@Injectable()
export class CmsService {
  /** 内置默认；后续可改为 DB 或远程配置 */
  private readonly defaultTools: CmsToolItem[] = [
    {
      id: 'schedule',
      name: '赛程中心',
      path: '/matches',
      isPremium: false,
      icon: 'calendar',
      description: '筛选联赛与日期',
    },
    {
      id: 'worldcup',
      name: '世界杯 2026',
      path: '/worldcup2026',
      isPremium: false,
      icon: 'trophy',
    },
    {
      id: 'rankings',
      name: '数据榜单',
      path: '/rankings',
      isPremium: false,
      icon: 'chart',
    },
    {
      id: 'poster',
      name: '社交海报',
      path: '/poster',
      isPremium: true,
      icon: 'image',
    },
  ];

  private readonly defaultReports: CmsReportItem[] = [
    {
      id: 'demo-el-clasico',
      title: '国家德比 · 战术复盘样例',
      summary: '演示用专题：压迫节奏、边路对位与关键球员状态（非真实订单数据）。',
      type: 'match',
      league: '西甲',
      tags: ['演示', '战术'],
      pages: 8,
      confidence: 72,
      isPremium: true,
      publishedAt: '2026-05-01T00:00:00.000Z',
      category: 'featured',
      preview: [
        { section: '阵型', detail: '主队 4-3-3 高位逼抢 vs 客队 4-2-3-1 反击站位。' },
        { section: '看点', detail: '边路一对一与中场二次球争夺为胜负手。' },
      ],
    },
    {
      id: 'demo-wc-group',
      title: '世界杯小组赛 · 出线形势观察',
      summary: '演示用赛季专题：积分形势与末轮对阵压力（静态样例）。',
      type: 'season',
      league: '世界杯',
      tags: ['演示', '世界杯'],
      pages: 6,
      isPremium: false,
      publishedAt: '2026-04-15T00:00:00.000Z',
      category: 'worldcup',
      preview: [{ section: '形势', detail: '各组积分密度与净胜球敏感度简析。' }],
    },
  ];

  private readonly defaultMaterials: CmsMaterialItem[] = [
    {
      id: 'brand-kit',
      title: '品牌基础素材包',
      category: 'brand',
      isPremium: false,
    },
    {
      id: 'match-card-template',
      title: '赛况卡片模板',
      category: 'template',
      isPremium: true,
    },
  ];

  listTools(): { items: CmsToolItem[] } {
    return { items: this.defaultTools };
  }

  private loadJsonFile<T>(name: string, fallback: T): T {
    try {
      const file = join(process.cwd(), 'config', name);
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf8')) as T;
      }
    } catch {
      /* use fallback */
    }
    return fallback;
  }

  listMaterials(category?: string): { items: CmsMaterialItem[] } {
    const c = category?.trim().toLowerCase();
    const all = this.loadJsonFile<CmsMaterialItem[]>('cms-materials.json', this.defaultMaterials);
    const items = c ? all.filter((m) => m.category === c) : all;
    return { items };
  }

  listReports(opts?: { category?: string; type?: string }): { items: CmsReportItem[] } {
    const cat = opts?.category?.trim().toLowerCase();
    const typ = opts?.type?.trim().toLowerCase() as CmsReportItem['type'] | undefined;
    const allowedTypes = new Set(['match', 'season', 'team', 'player']);
    let items = [...this.loadJsonFile<CmsReportItem[]>('cms-reports.json', this.defaultReports)];
    if (cat) items = items.filter((r) => r.category?.toLowerCase() === cat);
    if (typ && allowedTypes.has(typ)) items = items.filter((r) => r.type === typ);
    return { items };
  }
}
