export type MatchAccessLevel = 'guest' | 'free' | 'unlocked' | 'member' | 'admin';

export type MatchAccess = {
  isLoggedIn: boolean;
  isUnlocked: boolean;
  isMember: boolean;
  isAdmin: boolean;
  accessLevel: MatchAccessLevel;
  permissions: {
    basic: boolean;
    standingsBrief: boolean;
    recentResultsBrief: boolean;
    headToHeadBrief: boolean;
    injuries: boolean;
    lineups: boolean;
    predictions: boolean;
    odds: boolean;
    playerStatsFull: boolean;
    aiReports: boolean;
    tacticalScript: boolean;
    playerIntelligence: boolean;
    tacticalIntelligence: boolean;
  };
};
