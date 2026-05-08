---
title: Getting Started
description: Install nestjs-platform-elysia and bootstrap a NestJS app on Bun in under five minutes.
sidebar:
  order: 1
---

:::caution[Bun runtime only]
Elysia uses `Bun.serve()` internally and does **not** run on Node.js. This adapter inherits that constraint. Minimum Bun version: `1.2.0`.
:::

## Install

```bash
bun add nestjs-platform-elysia @nestjs/common @nestjs/core elysia
```

For CORS:

```bash
bun add @elysiajs/cors
```

For WebSocket gateways:

```bash
bun add @nestjs/websockets
```

## Bootstrap

```ts title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { ElysiaAdapter, type NestElysiaApplication } from 'nestjs-platform-elysia';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestElysiaApplication>(
    AppModule,
    new ElysiaAdapter(),
  );

  app.enableCors();

  await app.listen(3000);
}

bootstrap();
```

That's it. Write controllers and providers exactly as you would in a normal NestJS app — guards, pipes, interceptors, exception filters all flow through the same pipeline.

## A minimal controller

```ts title="src/cats/cats.controller.ts"
import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Get()
  list() {
    return [{ id: 1, name: 'Mia' }];
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    return { id, name: 'Mia' };
  }

  @Post()
  create(@Body() body: { name: string }) {
    return { id: 2, name: body.name };
  }
}
```

## What you get for free

- Full Nest DI, modules, guards, pipes, interceptors, exception filters
- HTTP method coverage including WebDAV verbs (`PROPFIND`, `PROPPATCH`, `MKCOL`, etc.)
- URI / Header / Media-Type / Custom versioning via `app.enableVersioning(...)`
- CORS via `app.enableCors()` (lazy-loads `@elysiajs/cors`)
- `MiddlewareConsumer.apply().forRoutes()` Express-style middleware
- `app.inject(new Request(...))` for testing without binding a port
- `app.register(plugin)` to mount Elysia plugins (e.g. `swagger()`, `bearer()`)
- `app.mount(path, fetchHandler)` to mount sub-apps

Continue with **[Route Decorators](/nestjs-platform-elysia/guides/route-decorators/)** to see how to attach Elysia schemas and lifecycle hooks to your controller methods.
