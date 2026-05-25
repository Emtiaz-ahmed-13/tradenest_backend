import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthConfigService {
  private readonly logger = new Logger(AuthConfigService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createAuth() {
    const googleClientId = this.configService.get<string>(
      'betterAuth.google.clientId',
    );
    const googleClientSecret = this.configService.get<string>(
      'betterAuth.google.clientSecret',
    );

    const socialProviders: BetterAuthOptions['socialProviders'] = {};

    if (googleClientId && googleClientSecret) {
      socialProviders.google = {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      };
    }

    return betterAuth({
      appName: this.configService.get<string>('appName') ?? 'TradeNest',
      baseURL:
        this.configService.get<string>('betterAuth.url') ??
        'http://localhost:3000',
      basePath: this.getAuthBasePath(),
      secret: this.configService.get<string>('betterAuth.secret'),
      trustedOrigins: this.getTrustedOrigins(),
      advanced: {
        disableCSRFCheck: this.configService.get<boolean>(
          'betterAuth.disableCsrfCheck',
        ),
      },
      database: prismaAdapter(this.prisma, {
        provider: 'postgresql',
        transaction: true,
      }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        requireEmailVerification: false,
        resetPasswordTokenExpiresIn: 60 * 60,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
          this.logger.log(`Password reset requested for ${user.email}: ${url}`);
        },
      },
      emailVerification: {
        sendOnSignUp: false,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60,
        sendVerificationEmail: async ({ user, url }) => {
          this.logger.log(`Email verification for ${user.email}: ${url}`);
        },
      },
      socialProviders,
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ['google'],
        },
      },
    });
  }

  private getTrustedOrigins(): string[] {
    const authOrigins =
      this.configService.get<string[]>('betterAuth.trustedOrigins') ?? [];
    const corsOrigins = this.configService.get<string[]>('cors.origin') ?? [];

    return [...new Set([...authOrigins, ...corsOrigins])];
  }

  private getAuthBasePath(): string {
    const apiPrefix =
      this.configService.get<string>('apiPrefix')?.replace(/^\/|\/$/g, '') ??
      'api/v1';

    return apiPrefix ? `/${apiPrefix}/auth` : '/auth';
  }
}
