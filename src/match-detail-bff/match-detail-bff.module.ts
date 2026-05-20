import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { MatchAfRawBundleModule } from '../match-af-raw-bundle/match-af-raw-bundle.module';
import { MatchesModule } from '../matches/matches.module';
import { PaywallModule } from '../paywall/paywall.module';
import { MatchDetailBffController } from './match-detail-bff.controller';
import { MatchDetailBffService } from './match-detail-bff.service';

@Module({
  imports: [
    AuthModule,
    PaywallModule,
    MatchAfRawBundleModule,
    ApiFootballModule,
    MatchesModule,
  ],
  controllers: [MatchDetailBffController],
  providers: [MatchDetailBffService],
  exports: [MatchDetailBffService],
})
export class MatchDetailBffModule {}
