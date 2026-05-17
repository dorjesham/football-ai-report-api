import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { VerifiedPhoneGuard } from './common/guards/verified-phone.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { SeasonsModule } from './seasons/seasons.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { MatchLiveModule } from './match-live/match-live.module';
import { MatchPhaseModule } from './match-phase/match-phase.module';
import { MatchesModule } from './matches/matches.module';
import { FootballDataModule } from './football-data/football-data.module';
import { PublicSourcesModule } from './public-sources/public-sources.module';
import { WeatherModule } from './weather/weather.module';
import { PredictionModule } from './prediction/prediction.module';
import { PlayerIntelligenceModule } from './player-intelligence/player-intelligence.module';
import { TacticsModule } from './tactics/tactics.module';
import { FantasyModule } from './fantasy/fantasy.module';
import { HeadToHeadModule } from './head-to-head/head-to-head.module';
import { SocialGuideModule } from './social-guide/social-guide.module';
import { AiReportModule } from './ai-report/ai-report.module';
import { OrdersModule } from './orders/orders.module';
import { WxPayModule } from './wxpay/wxpay.module';
import { UnlockModule } from './unlock/unlock.module';
import { AdminModule } from './admin/admin.module';
import { AdminViewModule } from './admin-view/admin-view.module';
import { CronModule } from './cron/cron.module';
import { TeamFollowModule } from './team-follow/team-follow.module';
import { DataIngestModule } from './data-ingest/data-ingest.module';
import { FootballFeedModule } from './football-feed/football-feed.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RedisModule } from './redis/redis.module';
import { MeModule } from './me/me.module';
import { RankingsModule } from './rankings/rankings.module';
import { PlayersModule } from './players/players.module';
import { InsightsModule } from './insights/insights.module';
import { CmsModule } from './cms/cms.module';
import { FeedbackModule } from './feedback/feedback.module';
import { UserNotificationsModule } from './user-notifications/user-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('httpThrottleTtlMs') ?? 60_000,
          limit: config.get<number>('httpThrottleLimit') ?? 30_000,
          skipIf: () => config.get<boolean>('httpThrottleDisabled') === true,
        },
      ],
    }),
    PrismaModule,
    UserNotificationsModule,
    RedisModule,
    HealthModule,
    AuthModule,
    TournamentsModule,
    SeasonsModule,
    CompetitionsModule,
    MatchesModule,
    MatchPhaseModule,
    MatchLiveModule,
    FootballDataModule,
    PublicSourcesModule,
    WeatherModule,
    PredictionModule,
    PlayerIntelligenceModule,
    TacticsModule,
    FantasyModule,
    HeadToHeadModule,
    SocialGuideModule,
    AiReportModule,
    OrdersModule,
    WxPayModule,
    UnlockModule,
    AdminModule,
    AdminViewModule,
    CronModule,
    TeamFollowModule,
    DataIngestModule,
    FootballFeedModule,
    MeModule,
    RankingsModule,
    PlayersModule,
    InsightsModule,
    CmsModule,
    FeedbackModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: VerifiedPhoneGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
