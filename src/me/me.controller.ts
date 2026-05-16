import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderProduct } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import {
  FavoriteMatchBodyDto,
  MatchReminderBodyDto,
  MatchReminderPatchDto,
} from './dto/me.dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('favorite-matches')
  @ApiOperation({ summary: '收藏的比赛列表（含 match 摘要）' })
  listFavorites(@CurrentUser() user: RequestUser) {
    return this.me.listFavorites(user.id);
  }

  @Post('favorite-matches')
  @ApiOperation({ summary: '收藏一场比赛' })
  addFavorite(@CurrentUser() user: RequestUser, @Body() dto: FavoriteMatchBodyDto) {
    return this.me.addFavorite(user.id, dto.matchId);
  }

  @Delete('favorite-matches/:matchId')
  @ApiOperation({ summary: '取消收藏' })
  removeFavorite(@CurrentUser() user: RequestUser, @Param('matchId') matchId: string) {
    return this.me.removeFavorite(user.id, matchId);
  }

  @Get('match-reminders')
  @ApiOperation({ summary: '比赛提醒列表' })
  listReminders(@CurrentUser() user: RequestUser) {
    return this.me.listReminders(user.id);
  }

  @Post('match-reminders')
  @ApiOperation({ summary: '添加比赛提醒（同场仅一条）' })
  createReminder(@CurrentUser() user: RequestUser, @Body() dto: MatchReminderBodyDto) {
    return this.me.createReminder(user.id, dto);
  }

  @Patch('match-reminders/:id')
  @ApiOperation({ summary: '更新提醒（偏移分钟、渠道、启用）' })
  patchReminder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: MatchReminderPatchDto,
  ) {
    return this.me.patchReminder(user.id, id, dto);
  }

  @Delete('match-reminders/:id')
  @ApiOperation({ summary: '删除提醒' })
  deleteReminder(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.me.deleteReminder(user.id, id);
  }

  @Get('preferences')
  @ApiOperation({ summary: '用户偏好 JSON' })
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.me.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: '浅合并偏好字段（顶层 key 写入 data 对象）' })
  patchPreferences(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    const safe: Record<string, unknown> = { ...body };
    delete safe['__proto__'];
    delete safe['constructor'];
    delete safe['prototype'];
    return this.me.patchPreferences(user.id, safe);
  }

  @Get('social-posters')
  @ApiOperation({ summary: '社交海报订单历史（cursor=上一页最后一条 orderNo）' })
  listPosters(
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.me.listSocialPosters(
      user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('report-unlocks')
  @ApiOperation({ summary: '已购单场报告解锁列表' })
  listUnlocks(@CurrentUser() user: RequestUser) {
    return this.me.listReportUnlocks(user.id);
  }

  @Get('orders')
  @ApiOperation({
    summary: '我的订单列表',
    description:
      'product 可选：REPORT_UNLOCK | FEATURED_REPORT_UNLOCK | SOCIAL_POSTER | MEMBERSHIP_PRO_MONTH | …；cursor 为上一页最后 orderNo',
  })
  listOrders(
    @CurrentUser() user: RequestUser,
    @Query('product') product?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const p = product?.trim();
    const allowed = new Set<string>(Object.values(OrderProduct));
    if (p && !allowed.has(p)) {
      throw new BadRequestException('Invalid product filter');
    }
    return this.me.listOrders(user.id, {
      product: p as OrderProduct | undefined,
      cursorOrderNo: cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
