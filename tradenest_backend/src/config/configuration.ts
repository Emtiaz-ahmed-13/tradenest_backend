export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appName: process.env.APP_NAME ?? 'TradeNest',
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  betterAuth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    // In development, relax CSRF so Postman/curl without Origin header still work.
    // Set BETTER_AUTH_DISABLE_CSRF_CHECK=false to test browser-like CSRF locally.
    disableCsrfCheck:
      (process.env.BETTER_AUTH_DISABLE_CSRF_CHECK ?? 'true').toLowerCase() ===
        'true' && (process.env.NODE_ENV ?? 'development') === 'development',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    authTtl: parseInt(process.env.AUTH_THROTTLE_TTL ?? '60000', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '10', 10),
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL ?? '30000', 10),
    max: parseInt(process.env.CACHE_MAX_ITEMS ?? '1000', 10),
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
    endpoint: process.env.R2_ENDPOINT,
    region: process.env.R2_REGION ?? 'auto',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true',
  },
});
