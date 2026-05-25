import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthConfigService } from './auth.service';

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [ConfigService, PrismaService],
      useFactory: (configService: ConfigService, prisma: PrismaService) => {
        const authConfigService = new AuthConfigService(configService, prisma);

        return {
          auth: authConfigService.createAuth(),
          bodyParser: {
            json: { limit: '2mb' },
            urlencoded: { limit: '2mb', extended: true },
          },
        };
      },
    }),
  ],
  providers: [AuthConfigService],
  exports: [AuthConfigService, BetterAuthModule],
})
export class AuthModule {}
