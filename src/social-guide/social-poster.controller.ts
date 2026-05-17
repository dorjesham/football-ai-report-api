import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresVerifiedPhone } from '../common/decorators/requires-verified-phone.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { SocialGuideService } from './social-guide.service';

@ApiTags('social-poster')
@ApiBearerAuth()
@Controller('matches')
export class SocialPosterController {
  constructor(private readonly svc: SocialGuideService) {}

  @RequiresVerifiedPhone()
  @Post(':id/social-poster/generate')
  generate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: { customElements?: string },
  ) {
    return this.svc.generatePoster(id, user.id, body?.customElements ?? '');
  }
}
