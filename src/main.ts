import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  const logger = app.get(Logger);
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Application listening at ${await app.getUrl()}`);
}

void bootstrap();
