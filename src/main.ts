import { writeFileSync } from 'fs';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(Logger);

  logger.log(`NODE_ENV: ${process.env.NODE_ENV}`);

  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.enableCors({
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    origin: [origin],
    credentials: true,
  });
  logger.log(`CORS set up for origin: ${origin}`);

  const config = new DocumentBuilder()
    .setTitle('RememberNow API')
    .setDescription('Epic memory augmentation app!')
    .setVersion('1.0')
    .build();
  const openApiDoc = SwaggerModule.createDocument(app, config);
  const cleanedDoc = cleanupOpenApiDoc(openApiDoc);

  if (process.env.NODE_ENV === 'dev') {
    writeFileSync('./openapi.json', JSON.stringify(cleanedDoc, null, 2));
    logger.log('OpenAPI spec written to openapi.json');
    SwaggerModule.setup('api', app, cleanedDoc);
  }

  await app.listen(process.env.PORT ?? 3333);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
