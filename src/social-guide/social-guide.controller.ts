import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { SocialGuideService } from './social-guide.service';

@ApiTags('social-guide')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class SocialGuideController {
  constructor(private readonly svc: SocialGuideService) {}

  @Post('matches/:id/social-guide/generate')
  gen(@Param('id') id: string) {
    return this.svc.generate(id);
  }

  @Get('matches/:id/social-guide')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  /** 仅校验足球主题并返回将提交给图像模型的英文 prompt（不扣费、不画图）。 */
  @Get('matches/:id/social-poster/prompt-preview')
  previewPrompt(
    @Param('id') id: string,
    @Query('customElements') customElements: string,
  ) {
    return this.svc.previewPosterPrompt(id, customElements || '');
  }
}
