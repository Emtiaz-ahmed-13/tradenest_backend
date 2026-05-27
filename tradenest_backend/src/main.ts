import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app);

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
