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
import { RequiresVerifiedPhone } from '../common/decorators/requires-verified-phone.decorator';
import { RequestUser } from '../common/types/request-user.type';
import {
  BrowseHistoryBodyDto,
  FavoriteMatchBodyDto,
  MatchReminderBodyDto,
  MatchReminderPatchDto,
  NotificationPatchDto,
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

  @RequiresVerifiedPhone()
  @Post('favorite-matches')
  @ApiOperation({ summary: '收藏一场比赛' })
  addFavorite(@CurrentUser() user: RequestUser, @Body() dto: FavoriteMatchBodyDto) {
    return this.me.addFavorite(user.id, dto.matchId);
  }

  @RequiresVerifiedPhone()
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

  @RequiresVerifiedPhone()
  @Post('match-reminders')
  @ApiOperation({ summary: '添加比赛提醒（同场仅一条）' })
  createReminder(@CurrentUser() user: RequestUser, @Body() dto: MatchReminderBodyDto) {
    return this.me.createReminder(user.id, dto);
  }

  @RequiresVerifiedPhone()
  @Patch('match-reminders/:id')
  @ApiOperation({ summary: '更新提醒（偏移分钟、渠道、启用）' })
  patchReminder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: MatchReminderPatchDto,
  ) {
    return this.me.patchReminder(user.id, id, dto);
  }

  @RequiresVerifiedPhone()
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

  @RequiresVerifiedPhone()
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
  @ApiOperation({
    summary: '社交海报订单历史（cursor=上一页最后一条 orderNo）',
    description: '列表项含 imageUrl（SocialGuide.posterImageUrl）、template（用户主题文案）',
  })
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

  @Get('browse-history')
  @ApiOperation({
    summary: '浏览历史（跨设备）',
    description: 'cursor 为上一页最后一项 id；同 user+match+type 再次 POST 会更新 visitedAt',
  })
  listBrowseHistory(
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.me.listBrowseHistory(
      user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @RequiresVerifiedPhone()
  @Post('browse-history')
  @ApiOperation({ summary: '记录浏览历史（analysis/poster 需 matchId）' })
  recordBrowseHistory(@CurrentUser() user: RequestUser, @Body() dto: BrowseHistoryBodyDto) {
    return this.me.recordBrowseHistory(user.id, dto);
  }

  @Get('notifications')
  @ApiOperation({
    summary: '通知收件箱（非赛程开球提醒）',
    description: '与 /me/match-reminders 分工：本接口为系统/支付/海报类消息',
  })
  listNotifications(
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const unread =
      unreadOnly === 'true' || unreadOnly === '1' ? true
      : unreadOnly === 'false' || unreadOnly === '0' ? false
      : undefined;
    return this.me.listNotifications(user.id, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      unreadOnly: unread,
    });
  }

  @RequiresVerifiedPhone()
  @Patch('notifications/:id')
  @ApiOperation({ summary: '标记通知已读' })
  patchNotification(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: NotificationPatchDto,
  ) {
    return this.me.patchNotification(user.id, id, dto.read);
  }

  @RequiresVerifiedPhone()
  @Post('notifications/read-all')
  @ApiOperation({ summary: '全部标记已读' })
  readAllNotifications(@CurrentUser() user: RequestUser) {
    return this.me.readAllNotifications(user.id);
  }

  @Get('report-unlocks')
  @ApiOperation({
    summary: '已购单场报告解锁列表',
    description: '含 title、reportStatus、freeSummary（列表摘要，非全文）',
  })
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
