import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';

// Trigger CI/CD build - 2026-02-14
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Increase body parser limit for Vapi webhook payloads
  // (end-of-call-report can include full transcripts and be several MB)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  const port = config.get<number>('PORT') ?? 3333;

  await app.listen(port);
  logger.log(`Backend listening on http://localhost:${port}`);
}

bootstrap();
