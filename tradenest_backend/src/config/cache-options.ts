import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import Redis from 'ioredis';

const logger = new Logger('CacheModule');

async function isRedisReachable(url: string): Promise<boolean> {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

export async function createCacheModuleOptions(configService: ConfigService) {
  const ttl = configService.get<number>('cache.ttl') ?? 30_000;
  const max = configService.get<number>('cache.max') ?? 1000;
  const redisEnabled = configService.get<boolean>('redis.enabled') ?? true;
  const redisUrl =
    configService.get<string>('redis.url') ?? 'redis://localhost:6379';

  if (!redisEnabled) {
    logger.warn('REDIS_ENABLED=false — using in-memory cache');
    return { ttl, max };
  }

  const reachable = await isRedisReachable(redisUrl);

  if (!reachable) {
    logger.warn(
      `Redis unavailable at ${redisUrl} — using in-memory cache. Start Redis with "docker compose up -d redis" or set REDIS_ENABLED=false.`,
    );
    return { ttl, max };
  }

  logger.log(`Redis cache connected at ${redisUrl}`);

  return {
    store: await redisStore({
      url: redisUrl,
      ttl,
    }),
    ttl,
    max,
  };
}
