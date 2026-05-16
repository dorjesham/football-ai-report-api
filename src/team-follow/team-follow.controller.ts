import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { FollowTeamDto } from './dto/follow-team.dto';
import { TeamFollowService } from './team-follow.service';

@ApiTags('worldcup2026-follow')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('worldcup2026/me')
export class TeamFollowController {
  constructor(private readonly teamFollow: TeamFollowService) {}

  @Get('team-follows')
  @ApiOperation({ summary: '当前用户关注的 2026 世界杯国家队列表' })
  list(@CurrentUser() user: RequestUser) {
    return this.teamFollow.listFollowed(user.id);
  }

  @Post('team-follows')
  @ApiOperation({ summary: '关注一支 wc26- 国家队' })
  follow(@CurrentUser() user: RequestUser, @Body() dto: FollowTeamDto) {
    return this.teamFollow.follow(user.id, dto.teamId);
  }

  @Delete('team-follows/:teamId')
  @ApiOperation({ summary: '取消关注' })
  unfollow(
    @CurrentUser() user: RequestUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teamFollow.unfollow(user.id, teamId);
  }

  @Get('team-follows/:teamId/status')
  @ApiOperation({ summary: '是否已关注某队' })
  status(
    @CurrentUser() user: RequestUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teamFollow.isFollowing(user.id, teamId);
  }
}
