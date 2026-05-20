import { Module } from '@nestjs/common';
import { LeaguesModule } from '../leagues/leagues.module';
import { TeamsController } from './teams.controller';
import { TeamsScheduleService } from './teams-schedule.service';

@Module({
  imports: [LeaguesModule],
  controllers: [TeamsController],
  providers: [TeamsScheduleService],
})
export class TeamsModule {}
