import { Module } from '@nestjs/common';
import { PublicSourcesService } from './public-sources.service';
import { PublicSourcesController } from './public-sources.controller';

@Module({
  controllers: [PublicSourcesController],
  providers: [PublicSourcesService],
  exports: [PublicSourcesService],
})
export class PublicSourcesModule {}
