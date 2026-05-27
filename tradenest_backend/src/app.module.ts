import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { redisStore } from 'cache-manager-ioredis-yet';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UploadModule } from './modules/upload/upload.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('throttle.ttl') ?? 60000,
          limit: configService.get<number>('throttle.limit') ?? 100,
        },
      ],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const ttl = configService.get<number>('cache.ttl') ?? 30000;
        const max = configService.get<number>('cache.max') ?? 1000;
        const redisUrl = configService.get<string>('redis.url');
        const isProduction =
          configService.get<string>('nodeEnv') === 'production';
        const isLocalRedis =
          !redisUrl ||
          redisUrl.includes('localhost') ||
          redisUrl.includes('127.0.0.1');

        if (isProduction && isLocalRedis) {
          return { ttl, max };
        }

        return {
          store: await redisStore({
            url: redisUrl,
            ttl,
          }),
          ttl,
          max,
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UploadModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    ChatModule,
    WishlistModule,
    OrdersModule,
    NotificationsModule,
    ReviewsModule,
    AdminModule,
    PaymentsModule,
    ReturnsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
