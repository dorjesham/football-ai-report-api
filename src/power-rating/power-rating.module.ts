import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PowerRatingService } from './power-rating.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [PowerRatingService],
  exports: [PowerRatingService],
})
export class PowerRatingModule {}
