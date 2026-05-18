import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { CompetitionsModule } from '../competitions/competitions.module';
import { LeaguesController } from './leagues.controller';
import { LeaguesStandingsService } from './leagues-standings.service';

@Module({
  imports: [ApiFootballModule, CompetitionsModule],
  controllers: [LeaguesController],
  providers: [LeaguesStandingsService],
  exports: [LeaguesStandingsService],
})
export class LeaguesModule {}
