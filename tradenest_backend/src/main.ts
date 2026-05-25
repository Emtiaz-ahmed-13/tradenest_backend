import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  app.enableCors({
    origin: configService.get<string[]>('cors.origin'),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.setGlobalPrefix(configService.get<string>('apiPrefix') ?? 'api/v1', {
    exclude: ['api/docs', 'api/docs-json'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(configService));
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  if (configService.get<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TradeNest API')
      .setDescription(
        'REST API for TradeNest — buy new products and sell pre-owned items.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
