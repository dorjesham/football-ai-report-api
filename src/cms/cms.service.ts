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

  listMaterials(category?: string): { items: CmsMaterialItem[] } {
    const c = category?.trim().toLowerCase();
    const items = c ?
        this.defaultMaterials.filter((m) => m.category === c)
      : this.defaultMaterials;
    return { items };
  }
}
