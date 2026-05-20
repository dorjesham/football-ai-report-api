import { Injectable } from '@nestjs/common';
import { LocalizationService } from './localization.service';

@Injectable()
export class LocalizationPostIngestHook {
  constructor(private readonly l10n: LocalizationService) {}

  onTeamUpsert(team: Parameters<LocalizationService['onTeamUpsert']>[0]): Promise<void> {
    return this.l10n.onTeamUpsert(team);
  }

  onPlayerUpsert(player: Parameters<LocalizationService['onPlayerUpsert']>[0]): Promise<void> {
    return this.l10n.onPlayerUpsert(player);
  }

  onMatchUpsert(match: Parameters<LocalizationService['onMatchUpsert']>[0]): Promise<void> {
    return this.l10n.onMatchUpsert(match);
  }

  onRefereeSeen(referee: Parameters<LocalizationService['onRefereeSeen']>[0]): Promise<void> {
    return this.l10n.onRefereeSeen(referee);
  }

  onCoachSeen(coach: Parameters<LocalizationService['onCoachSeen']>[0]): Promise<void> {
    return this.l10n.onCoachSeen(coach);
  }
}
