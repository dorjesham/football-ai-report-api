export type TodoSeverity = 'info' | 'warning' | 'critical';

export type TodoItem = {
  id: string;
  severity: TodoSeverity;
  title: string;
  description: string;
  actionLabel: string;
  actionRoute?: string;
  actionType: 'navigate' | 'runBundle' | 'review';
  completionMode: 'auto' | 'manual';
  confirmRequired?: boolean;
  meta?: { bundleId?: string; jobId?: string };
};

export type BootstrapStepKey =
  | 'seed'
  | 'catalog'
  | 'full_initial'
  | 'pre_match'
  | 'finished';

export type StepStatus =
  | 'NOT_STARTED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'NEEDS_REPAIR';

export type BootstrapStatusResponse = {
  bootstrapStatus:
    | 'NOT_STARTED'
    | 'RUNNING'
    | 'PARTIAL_SUCCESS'
    | 'COMPLETED'
    | 'NEEDS_REPAIR';
  steps: Array<{
    key: BootstrapStepKey;
    status: StepStatus;
    jobId?: string;
    finishedAt?: string;
  }>;
  lastFullInitial?: { jobId?: string; finishedAt: string } | null;
};

export type DailySummaryResponse = {
  tab: string;
  lines: string[];
};

export type MatchHealthSummary = {
  green: number;
  yellow: number;
  red: number;
};

export type RecentIncident = {
  id: string;
  severity: TodoSeverity;
  title: string;
  createdAt: string;
  route: string;
};

export type OverviewCards = {
  totalUsers: number;
  todayNewUsers: number;
  todayKickoffMatches: number;
  liveMatches: number;
  pendingAiDrafts: number;
  todayRevenueCents: number;
};
