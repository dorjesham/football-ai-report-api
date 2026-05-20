export type PaidModuleDto = {
  locked: boolean;
  available: boolean;
  hasData?: boolean;
  status?: 'present' | 'empty' | 'missing';
  title: string;
  description?: string;
  source?: 'api-football' | 'deepseek';
  data?: unknown | null;
};

export function buildPaidModule(args: {
  locked: boolean;
  hasData: boolean;
  status: 'present' | 'empty' | 'missing';
  title: string;
  description?: string;
  source?: 'api-football' | 'deepseek';
  data: unknown | null;
}): PaidModuleDto {
  const available = args.status !== 'missing';
  return {
    locked: args.locked,
    available,
    hasData: args.hasData,
    status: args.status,
    title: args.title,
    description: args.description,
    source: args.source,
    data: args.locked ? null : args.data,
  };
}
