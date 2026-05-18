import { writeFileSync } from 'fs';

import { config as loadDotenv } from 'dotenv';

import { startOtel } from './observability/otel';

async function bootstrap() {
  // Load .env ourselves before startOtel - NestJS's ConfigModule would
  // normally do this, but it doesn't run until bootstrap.
  loadDotenv();

  // Initialize the OpenTelemetry SDK + Langfuse span processor BEFORE any
  // NestJS / LangChain code is imported so auto-instrumentation hooks attach.
  startOtel();

  const { Logger } = await import('@nestjs/common');
  const { NestFactory } = await import('@nestjs/core');
  const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
  const { cleanupOpenApiDoc } = await import('nestjs-zod');
  const { AppModule } = await import('./app.module');
  const { AppConfigService, Environment } = await import('./config/app');
  const { PinoLoggerService } = await import('./observability');

  // bufferLogs: true defers early bootstrap log lines until useLogger fires
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLoggerService));
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  const appConfig = app.get(AppConfigService);

  logger.log(`NODE_ENV: ${appConfig.env}`);

  app.enableCors({
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    origin: [appConfig.frontendUrl],
    credentials: true,
  });
  logger.log(`CORS set up for origin: ${appConfig.frontendUrl}`);

  const config = new DocumentBuilder()
    .setTitle('RememberNow API')
    .setDescription('Epic memory augmentation app!')
    .setVersion('1.0')
    .setOpenAPIVersion('3.1.0')
    .build();
  const openApiDoc = SwaggerModule.createDocument(app, config);
  const cleanedDoc = cleanupOpenApiDoc(openApiDoc, { version: '3.1' });

  if (appConfig.env === Environment.Development) {
    writeFileSync('./openapi.json', JSON.stringify(cleanedDoc, null, 2));
    logger.log('OpenAPI spec written to openapi.json');
    SwaggerModule.setup('api', app, cleanedDoc);
  }

  await app.listen(appConfig.port);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
