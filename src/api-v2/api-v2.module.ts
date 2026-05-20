import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchDetailBffModule } from '../match-detail-bff/match-detail-bff.module';
import { OrdersModule } from '../orders/orders.module';
import { PaywallModule } from '../paywall/paywall.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogV2Controller } from './catalog-v2.controller';
import { CatalogV2Service } from './catalog-v2.service';
import { LeaguesV2Controller } from './leagues-v2.controller';
import { LeaguesV2Service } from './leagues-v2.service';
import { MatchesV2Controller } from './matches-v2.controller';
import { MatchesV2Service } from './matches-v2.service';

@Module({
  imports: [PrismaModule, AuthModule, MatchDetailBffModule, PaywallModule, OrdersModule],
  controllers: [MatchesV2Controller, LeaguesV2Controller, CatalogV2Controller],
  providers: [MatchesV2Service, LeaguesV2Service, CatalogV2Service],
  exports: [MatchesV2Service, LeaguesV2Service, CatalogV2Service],
})
export class ApiV2Module {}
