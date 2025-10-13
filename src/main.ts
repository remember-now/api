import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { writeFileSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(Logger);

  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  logger.log(`CORS set up for origin: ${origin}`);

  app.enableCors({
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    origin: [origin],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('RememberNow API')
    .setDescription(
      'RememberNow API provides intelligent memory augmentation through AI-powered agents. ' +
        'Features include personal memory management, conversational AI interactions, ' +
        'and adaptive learning capabilities to enhance cognitive recall and organization.',
    )
    .setVersion('1.0')
    .build();
  const openApiDoc = SwaggerModule.createDocument(app, config);
  const cleanedDoc = cleanupOpenApiDoc(openApiDoc);

  if (process.env.NODE_ENV === 'dev') {
    writeFileSync('./openapi.json', JSON.stringify(cleanedDoc, null, 2));
    logger.log('OpenAPI spec written to openapi.json');
  }
  SwaggerModule.setup('api', app, cleanedDoc);

  await app.listen(process.env.PORT ?? 3333);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
