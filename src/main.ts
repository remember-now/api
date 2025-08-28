import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(Logger);

  app.enableCors({
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    origin: [process.env.FRONTEND_URL || 'http://localhost:5173'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3333);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
