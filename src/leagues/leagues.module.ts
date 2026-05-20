import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { CompetitionsModule } from '../competitions/competitions.module';
import { LocalizationModule } from '../localization/localization.module';
import { MatchesModule } from '../matches/matches.module';
import { LeaguesController } from './leagues.controller';
import { LeaguesStandingsService } from './leagues-standings.service';

@Module({
  imports: [ApiFootballModule, CompetitionsModule, LocalizationModule, MatchesModule],
  controllers: [LeaguesController],
  providers: [LeaguesStandingsService],
  exports: [LeaguesStandingsService],
})
export class LeaguesModule {}
