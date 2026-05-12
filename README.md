# nestjs-platform-elysia

NestJS HTTP adapter for [Elysia](https://elysiajs.com/) on [Bun](https://bun.sh/).

📚 **[Full documentation →](https://pedro3g.github.io/nestjs-platform-elysia)**

[![npm](https://img.shields.io/npm/v/nestjs-platform-elysia.svg)](https://www.npmjs.com/package/nestjs-platform-elysia) [![CI](https://github.com/pedro3g/nestjs-platform-elysia/actions/workflows/ci.yml/badge.svg)](https://github.com/pedro3g/nestjs-platform-elysia/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> ⚠️ **Bun runtime only.** Elysia uses `Bun.serve()` internally and does not run on Node.js.

## Why

NestJS gives you DI, modules, guards, pipes, interceptors, exception filters. Elysia gives you Bun-native performance, end-to-end type safety, TypeBox/Zod validation at the framework level, lifecycle hooks, and a plugin ecosystem.

This adapter lets you keep both: write Nest controllers as usual while still being able to register Elysia plugins, attach TypeBox schemas, mount sub-apps, and use `app.handle()` for testing — without losing what makes Elysia worth choosing.

## Install

```bash
bun add nestjs-platform-elysia @nestjs/common @nestjs/core elysia
```

## Quick start

```ts
import { NestFactory } from '@nestjs/core';
import { ElysiaAdapter, type NestElysiaApplication } from 'nestjs-platform-elysia';
import { AppModule } from './app.module';

const app = await NestFactory.create<NestElysiaApplication>(
  AppModule,
  new ElysiaAdapter(),
);
await app.listen(3000);
```

## Guides

| Guide | What's inside |
|---|---|
| [Getting Started](https://pedro3g.github.io/nestjs-platform-elysia/guides/getting-started/) | Install, bootstrap, project layout |
| [Route Decorators](https://pedro3g.github.io/nestjs-platform-elysia/guides/route-decorators/) | `@RouteSchema`, `@RouteHook`, `@RouteConfig`, `@RouteDetail` |
| [Body Parsing](https://pedro3g.github.io/nestjs-platform-elysia/guides/body-parsing/) | `rawBody`, custom parsers, size limits |
| [Trust Proxy](https://pedro3g.github.io/nestjs-platform-elysia/guides/trust-proxy/) | `X-Forwarded-*` resolution, Express-compatible hop count |
| [WebSockets](https://pedro3g.github.io/nestjs-platform-elysia/guides/websockets/) | `@WebSocketGateway` on the same Bun server, hardening config |
| [Testing](https://pedro3g.github.io/nestjs-platform-elysia/guides/testing/) | `app.inject()` patterns, fixtures |
| [API Reference](https://pedro3g.github.io/nestjs-platform-elysia/reference/api/) | Adapter, request, reply, interfaces |

## What's supported

- All HTTP methods, route params, query, body, default status codes
- Full Nest pipeline: Guards, Pipes, Interceptors, Exception Filters
- `@RouteSchema` with TypeBox/Zod for framework-level validation
- Versioning: URI, Header, Media-Type, Custom
- CORS via `@elysiajs/cors`
- `MiddlewareConsumer.apply().forRoutes()` (Express-style middleware)
- `app.register(plugin)` for Elysia plugins (swagger, bearer, openapi, etc.)
- `app.mount(path, handler)` for sub-apps and fetch handlers
- `app.inject(Request)` for programmatic testing
- WebSocket gateways on the same Bun server (no second port)

## Known limitations

- `useStaticAssets()` — not implemented; use `app.register(staticPlugin())` from `@elysiajs/static`.
- `setViewEngine()` — not implemented (no SSR templating support).
- `@Req()` / `@Res()` — receive `ElysiaRequest` / `ElysiaReply` wrappers, not Express request/response. Express-only APIs like `.is()`, `.accepts()`, `.signedCookies` are not exposed.
- Microservices / hybrid app — untested.

## Versioning

Pre-1.0. APIs may change between minor versions. See [CHANGELOG.md](./CHANGELOG.md).

## Releasing

Releases are cut by pushing a `v*.*.*` tag — see [.github/workflows/release.yml](./.github/workflows/release.yml). The workflow runs `bun run check`, verifies the tag matches `package.json#version`, publishes to npm via OIDC Trusted Publishing with provenance, and creates a GitHub Release.

## License

[MIT](./LICENSE)
