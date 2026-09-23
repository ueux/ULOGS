import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { APIKeyModule } from './modules/api-key/api-key.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './infra/cache.module';
import { RedisModule } from './infra/redis.module';
import { LogsModule } from './modules/logs/logs.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingModule } from './modules/billing/billing.module';
import { AlertModule } from './modules/alert/alert.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    APIKeyModule,
    DatabaseModule,
    CacheModule,
    RedisModule,
    LogsModule,
    BillingModule,
    AlertModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
