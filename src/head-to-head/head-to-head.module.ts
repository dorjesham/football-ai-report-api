import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { HeadToHeadService } from './head-to-head.service';
import { HeadToHeadController } from './head-to-head.controller';

@Module({
  imports: [ApiFootballModule],
  controllers: [HeadToHeadController],
  providers: [HeadToHeadService],
  exports: [HeadToHeadService],
})
export class HeadToHeadModule {}
