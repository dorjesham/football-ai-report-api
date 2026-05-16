import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PowerRatingService } from './power-rating.service';

@Module({
  imports: [PrismaModule],
  providers: [PowerRatingService],
  exports: [PowerRatingService],
})
export class PowerRatingModule {}
