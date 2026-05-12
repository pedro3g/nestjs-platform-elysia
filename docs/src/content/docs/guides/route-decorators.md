---
title: Route Decorators
description: Attach Elysia schemas, lifecycle hooks and OpenAPI metadata to NestJS controller methods.
sidebar:
  order: 2
---

The adapter ships four decorators that forward metadata to Elysia's per-route `localHook`. Combine them freely with the standard NestJS decorators — they coexist with `@Get`, `@Post`, `@UseGuards`, `@UseInterceptors`, etc.

## `@RouteSchema`

Attach a TypeBox or Zod schema to a route. Validation runs at the **framework level**, before your controller ever executes — invalid requests return `422` with a structured error body.

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { t } from 'elysia';
import { RouteSchema } from 'nestjs-platform-elysia';

@Controller('users')
export class UsersController {
  @Post()
  @RouteSchema({
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: 'email' }),
      age: t.Number({ minimum: 0 }),
    }),
  })
  create(@Body() body: { name: string; email: string; age: number }) {
    return body;
  }
}
```

Schema slots: `body`, `query`, `params`, `headers`, `cookie`, `response`. Each accepts a TypeBox schema (via `t.*`) or a Zod schema directly — Elysia handles both.

:::tip[Why this matters]
With `@RouteSchema`, invalid requests never reach your controller, your guards, or your pipes. Elysia rejects them at the parse layer with a detailed validation report. That's faster and produces better error messages than running `class-validator` after the fact.
:::

## `@RouteHook`

Attach Elysia lifecycle hooks scoped to a single route.

```ts
import { Controller, Get } from '@nestjs/common';
import { RouteHook } from 'nestjs-platform-elysia';

@Controller('reports')
export class ReportsController {
  @Get('expensive')
  @RouteHook({
    beforeHandle: ({ headers }) => {
      if (!headers['x-tenant']) {
        return new Response('missing tenant', { status: 400 });
      }
    },
    afterResponse: ({ path }) => {
      console.log(`served ${path}`);
    },
  })
  expensive() {
    return { ok: true };
  }
}
```

Available hook slots: `parse`, `transform`, `beforeHandle`, `afterHandle`, `afterResponse`, `mapResponse`, `error`.

## `@RouteConfig`

Pass arbitrary route config through to Elysia. Useful for plugins that read from `route.config` (rate limiters, caches, custom middleware).

```ts
@Get('rate-limited')
@RouteConfig({
  rateLimit: { max: 10, window: '1m' },
})
rateLimited() {
  return { ok: true };
}
```

:::note[Choosing between `@RouteConfig` and `@RouteDetail`]
`@RouteConfig` writes to the top level of Elysia's `localHook` — for Elysia plugins that read `route.config`. `@RouteDetail` writes to `localHook.detail` — for OpenAPI metadata consumers (`@elysiajs/openapi`, `@elysiajs/swagger`). OpenAPI fields like `tags`, `summary`, `description` belong on `@RouteDetail`; only `@RouteDetail` surfaces them in generated specs.
:::

## `@RouteDetail`

OpenAPI-style metadata. Consumed by `@elysiajs/openapi` (or `@elysiajs/swagger`) when registered as a plugin.

```ts
@Post()
@RouteDetail({
  summary: 'Create a user',
  description: 'Creates a new user record. Email must be unique.',
  tags: ['users'],
  deprecated: false,
})
create() {
  // ...
}
```

## Combining everything

```ts
@Post()
@UseGuards(AuthGuard)        // standard Nest
@Roles('admin')              // standard Nest
@RouteSchema({ body: t.Object({ /* ... */ }) })
@RouteDetail({ summary: 'Create cat', tags: ['cats'] })
create(@Body() body: CreateCatDto) {
  // Schema validated by Elysia (422 on bad input)
  // Auth checked by Nest guard (401/403)
  // Role checked by Nest reflector (403)
  // Then your handler runs
}
```
