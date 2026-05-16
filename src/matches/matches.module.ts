import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { AuthModule } from '../auth/auth.module';
import { UnlockModule } from '../unlock/unlock.module';
import { MatchCacheInvalidationModule } from './match-cache-invalidation.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { MatchLiveModule } from '../match-live/match-live.module';

@Module({
  imports: [AuthModule, UnlockModule, MatchCacheInvalidationModule, ApiFootballModule, MatchLiveModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
