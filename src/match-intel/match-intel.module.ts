import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MatchIntelFreshnessService } from './match-intel-freshness.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [MatchIntelFreshnessService],
  exports: [MatchIntelFreshnessService],
})
export class MatchIntelModule {}
