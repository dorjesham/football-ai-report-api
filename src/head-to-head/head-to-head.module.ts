import { Module } from '@nestjs/common';
import { HeadToHeadService } from './head-to-head.service';
import { HeadToHeadController } from './head-to-head.controller';

@Module({
  controllers: [HeadToHeadController],
  providers: [HeadToHeadService],
  exports: [HeadToHeadService],
})
export class HeadToHeadModule {}
