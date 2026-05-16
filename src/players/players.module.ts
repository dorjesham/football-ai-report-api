import { Module } from '@nestjs/common';
import { PlayersPublicController } from './players-public.controller';
import { PlayersPublicService } from './players-public.service';

@Module({
  controllers: [PlayersPublicController],
  providers: [PlayersPublicService],
})
export class PlayersModule {}
