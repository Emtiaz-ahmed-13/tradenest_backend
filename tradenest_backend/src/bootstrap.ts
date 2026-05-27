import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';

export function configureApp(app: INestApplication) {
  const configService = app.get(ConfigService);

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
}
