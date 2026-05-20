import { Module, forwardRef } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { AuthModule } from '../auth/auth.module';
import { UnlockModule } from '../unlock/unlock.module';
import { MatchCacheInvalidationModule } from './match-cache-invalidation.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { TacticsModule } from '../tactics/tactics.module';
import { MatchInjuriesService } from './match-injuries.service';

@Module({
  imports: [
    AuthModule,
    UnlockModule,
    MatchCacheInvalidationModule,
    ApiFootballModule,
    forwardRef(() => MatchLiveModule),
    forwardRef(() => TacticsModule),
  ],
  controllers: [MatchesController],
  providers: [MatchesService, MatchInjuriesService],
  exports: [MatchesService, MatchInjuriesService],
})
export class MatchesModule {}
