import { Module } from '@nestjs/common';
import { TeamFollowController } from './team-follow.controller';
import { TeamFollowService } from './team-follow.service';

@Module({
  controllers: [TeamFollowController],
  providers: [TeamFollowService],
})
export class TeamFollowModule {}
