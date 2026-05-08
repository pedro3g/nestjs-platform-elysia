# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `trustProxy` option on `ElysiaAdapter` — accepts `true` (resolve to leftmost `X-Forwarded-For`) or a custom resolver `(forwardedFor: string[], directIp?: string) => string | undefined`. When enabled, `request.ip` honors `X-Forwarded-For` (with `X-Real-IP` as fallback), `request.hostname` honors `X-Forwarded-Host`, and `request.protocol` honors `X-Forwarded-Proto`. Default remains `false` (direct connection only).

## [0.1.0] - 2026-05-08

Initial release.

### Added

- `ElysiaAdapter` extending Nest's `AbstractHttpAdapter` — full Nest pipeline (DI, modules, guards, pipes, interceptors, exception filters) on top of Elysia / Bun.serve
- `NestElysiaApplication` interface exposing `inject()`, `register()`, `mount()`, `enableCors()` directly on the app via Nest's adapter `Proxy` (works through both `NestFactory.create` and `Test.createTestingModule`)
- Route metadata decorators forwarded to Elysia's per-route `localHook`:
  - `@RouteSchema` for TypeBox / Zod validation at the framework level (returns `422` before the controller runs)
  - `@RouteHook` for Elysia lifecycle hooks per route (`parse`, `transform`, `beforeHandle`, `afterHandle`, `afterResponse`, `mapResponse`, `error`)
  - `@RouteConfig` for arbitrary Elysia route config
  - `@RouteDetail` for OpenAPI-style metadata (consumed by `@elysiajs/openapi` if registered)
- HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`, `ALL` + WebDAV verbs (`PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `SEARCH`)
- Versioning: `URI`, `Header`, `Media-Type`, `Custom` — backed by a per-route dispatch table that picks the matching handler at request time
- CORS via `@elysiajs/cors` (optional peer dep, lazy-loaded when `enableCors()` is called)
- `MiddlewareConsumer.apply().forRoutes()` Express-style middleware wired through Elysia's global `onBeforeHandle` hook with path matching via `path-to-regexp`
- Error bridge: `HttpException` and userland errors flow through Nest's exception filter; Elysia native error codes (`VALIDATION`, `PARSE`, `INVALID_COOKIE_SIGNATURE`, `INVALID_FILE_TYPE`) are handled by Elysia (e.g. validation stays `422`, never wrapped as `500`)
- Test suite: 89 tests / 177 assertions covering unit (reply/request wrappers, version-utils dispatch, path-utils matcher) and e2e (routes, guards/pipes/interceptors, schema validation, error handling, versioning, CORS, middleware, public API surface)

### Known Limitations

- `@WebSocketGateway()` not bridged — workaround: `app.register(elysiaWs())` directly
- `useStaticAssets()`, `setViewEngine()` not implemented (no SSR templating support)
- `useBodyParser()` is a no-op; Elysia parses bodies automatically based on `content-type`
- `@Req()` / `@Res()` deliver `ElysiaRequest` / `ElysiaReply` wrappers, not Express-shaped objects (Express-only APIs like `.is()`, `.accepts()`, `.signedCookies` are not exposed)
- Microservices / hybrid app mode untested

### Runtime

- **Bun-only.** Elysia uses `Bun.serve()` internally and does not run on Node.js. Adapter inherits this constraint.
- Minimum Bun version: `1.1.0`.
