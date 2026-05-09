# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-05-08

### Fixed

- `compilePathMatcher` now throws when `path-to-regexp` rejects a middleware pattern instead of silently falling back to a match-all regex. A typo'd middleware path used to register as a global middleware; now the boot fails loud with the original pattern in the error message.

### Changed

- `ElysiaAdapter.applyVersionFilter` no longer attaches a `version` field to the handler function. Versions are tracked in a private `WeakMap` keyed by handler reference, so the version isn't lost if the handler is wrapped downstream.
- Per-request middleware dispatch no longer recomputes the `RequestMethod` enum → string for every entry; the upper-case method string is cached on `MiddlewareEntry` at registration.
- `ElysiaReply.getHeaders()` returns the underlying header store directly instead of allocating a fresh shallow copy on every call.
- `ElysiaRequest` memoizes parsed `X-Forwarded-For` and the resolved direct connection IP per request; repeated reads of `request.ip` no longer re-split the header or re-invoke `server.requestIP()`.

### Types

- `ElysiaAdapter.getInstance<T = AnyElysia>()` now defaults `T` to Elysia's `AnyElysia` instead of `unknown`, so consumers reaching for the raw Elysia escape hatch get full typings without an explicit type argument.

## [0.1.1] - 2026-05-08

### Fixed

- Corrected `repository.url`, `bugs.url` and `homepage` in `package.json` to point to the actual GitHub repository (`pedro3g/nestjs-platform-elysia`).

### Changed

- Minimum Bun version bumped from `1.1.0` to `1.2.0` in `engines.bun`. Bun's lockfile format changed across 1.1 → 1.3 and `bun install --frozen-lockfile` rejects lockfiles produced by newer versions; pinning to `>=1.2.0` reflects what's actually testable in CI.
- CI matrix simplified to `bun-version: latest` (the floor version is documented via `engines.bun`; running both didn't add value while the lockfile is incompatible).

## [0.1.0] - 2026-05-08

Initial release.

### Added

- `ElysiaAdapter` extending Nest's `AbstractHttpAdapter` — full Nest pipeline (DI, modules, guards, pipes, interceptors, exception filters) on top of Elysia / Bun.serve.
- `NestElysiaApplication` interface exposing `inject()`, `register()`, `mount()`, `enableCors()` directly on the app via Nest's adapter `Proxy` (works through both `NestFactory.create` and `Test.createTestingModule`).
- `ElysiaWsAdapter` bridges `@WebSocketGateway()` / `@SubscribeMessage()` onto the same Bun server as HTTP. `app.useWebSocketAdapter(new ElysiaWsAdapter(app))` registers Elysia `app.ws(path, ...)` routes per gateway, dispatching `{event, data}` envelopes to the matching `@SubscribeMessage` handler. Handler return values are wrapped back into the inbound envelope, or kept verbatim if the handler returns its own `{event, data}` shape. Works with Observable / Promise / sync values via Nest's `transform` pipeline.
- Route metadata decorators forwarded to Elysia's per-route `localHook`:
  - `@RouteSchema` for TypeBox / Zod validation at the framework level (returns `422` before the controller runs).
  - `@RouteHook` for Elysia lifecycle hooks per route (`parse`, `transform`, `beforeHandle`, `afterHandle`, `afterResponse`, `mapResponse`, `error`).
  - `@RouteConfig` for arbitrary Elysia route config.
  - `@RouteDetail` for OpenAPI-style metadata (consumed by `@elysiajs/openapi` if registered).
- `trustProxy` option on `ElysiaAdapter` — accepts `true` (resolve to leftmost `X-Forwarded-For`) or a custom resolver `(forwardedFor, directIp) => string | undefined`. Honors `X-Forwarded-For` (with `X-Real-IP` fallback) on `request.ip`, `X-Forwarded-Host` on `request.hostname`, `X-Forwarded-Proto` on `request.protocol`. Default `false`.
- `useBodyParser()` actually parses now. Combined with `NestApplicationOptions.rawBody: true` it captures the raw body buffer onto `request.rawBody` for parsed requests; calling `useBodyParser(type)` once or more narrows capture to the listed content-types. Passing a `parser` (3rd user-facing arg) registers a custom Elysia `onParse` handler — receives `{ request, contentType, rawBody }` and returns the parsed value.
- HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`, `ALL` + WebDAV verbs (`PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `SEARCH`).
- Versioning: `URI`, `Header`, `Media-Type`, `Custom` — backed by a per-route dispatch table that picks the matching handler at request time.
- CORS via `@elysiajs/cors` (optional peer dep, lazy-loaded when `enableCors()` is called).
- `MiddlewareConsumer.apply().forRoutes()` Express-style middleware wired through Elysia's global `onBeforeHandle` hook with path matching via `path-to-regexp`.
- Error bridge: `HttpException` and userland errors flow through Nest's exception filter; Elysia native error codes (`VALIDATION`, `PARSE`, `INVALID_COOKIE_SIGNATURE`, `INVALID_FILE_TYPE`) are handled by Elysia (e.g. validation stays `422`, never wrapped as `500`).
- `Set-Cookie` emitted as separate header lines per RFC 6265: `reply.header('Set-Cookie', [...])` and repeated `reply.appendHeader('Set-Cookie', ...)` accumulate as an array so Bun produces distinct `Set-Cookie` headers instead of comma-joining. Other combinable headers (`Vary`, `Cache-Control`, ...) keep the comma-join behavior.
- `StreamableFile` returns from controllers stream through `ElysiaReply.stream()` with `content-type` / `content-disposition` / `content-length` sourced from the `StreamableFile` options.
- Test suite: 119 tests / 238 assertions across unit (reply/request wrappers, version-utils dispatch, path-utils matcher) and e2e (routes, guards / pipes / interceptors, `@RouteSchema` validation, error handling, versioning, CORS, middleware, trust proxy, body parsing, streaming + multi-value cookies, public API surface, WebSocket gateways).

### Known Limitations

- `useStaticAssets()`, `setViewEngine()` not implemented (no SSR templating support — register `@elysiajs/static` directly via `app.register()` if needed).
- `@Req()` / `@Res()` deliver `ElysiaRequest` / `ElysiaReply` wrappers, not Express-shaped objects. Express-only APIs like `.is()`, `.accepts()`, `.signedCookies` are not exposed.
- Microservices / hybrid app mode untested.

### Runtime

- **Bun-only.** Elysia uses `Bun.serve()` internally and does not run on Node.js. Adapter inherits this constraint.
- Minimum Bun version: `1.2.0` (see 0.1.1 release notes — bumped from 1.1.0).
