import { Module, forwardRef } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { AuthModule } from '../auth/auth.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { UnlockModule } from '../unlock/unlock.module';
import { MatchPhaseController } from './match-phase.controller';
import { MatchPhaseService } from './match-phase.service';

@Module({
  imports: [
    AuthModule,
    UnlockModule,
    forwardRef(() => MatchLiveModule),
    ApiFootballModule,
  ],
  controllers: [MatchPhaseController],
  providers: [MatchPhaseService],
  exports: [MatchPhaseService],
})
export class MatchPhaseModule {}
