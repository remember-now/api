import { writeFileSync } from 'fs';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import { AppModule } from './app.module';
import { AppConfigService, Environment } from './config/app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(Logger);
  const appConfig = app.get(AppConfigService);

  logger.log(`NODE_ENV: ${appConfig.env}`);

  app.enableCors({
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    origin: [appConfig.frontendUrl],
    credentials: true,
  });
  logger.log(`CORS set up for origin: ${appConfig.frontendUrl}`);

  const config = new DocumentBuilder()
    .setTitle('RememberNow API')
    .setDescription('Epic memory augmentation app!')
    .setVersion('1.0')
    .build();
  const openApiDoc = SwaggerModule.createDocument(app, config);
  const cleanedDoc = cleanupOpenApiDoc(openApiDoc);

  if (appConfig.env === Environment.Development) {
    writeFileSync('./openapi.json', JSON.stringify(cleanedDoc, null, 2));
    logger.log('OpenAPI spec written to openapi.json');
    SwaggerModule.setup('api', app, cleanedDoc);
  }

  await app.listen(appConfig.port);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
