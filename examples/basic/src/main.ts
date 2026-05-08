import { NestFactory } from '@nestjs/core';
import { ElysiaAdapter, type NestElysiaApplication } from 'platform-elysia';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestElysiaApplication>(AppModule, new ElysiaAdapter());

  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  console.log(`🦊 platform-elysia example listening on http://localhost:${port}`);
}

bootstrap();
