import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { Public } from '../common/decorators/public.decorator';
import { WxpayService } from './wxpay.service';

@ApiTags('wxpay')
@Controller('wxpay')
export class WxpayController {
  constructor(private readonly wx: WxpayService) {}

  @Public()
  @Post('notify')
  notify(@Req() req: RawBodyRequest<Request>, @Body() body: Record<string, unknown>) {
    const raw =
      req.rawBody && Buffer.isBuffer(req.rawBody) ?
        req.rawBody.toString('utf8')
      : JSON.stringify(body ?? {});
    return this.wx.handleNotify(req.headers, body, raw);
  }
}
