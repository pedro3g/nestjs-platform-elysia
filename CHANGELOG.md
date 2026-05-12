# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-05-12

### Security

- **Body limit is now enforced on the default parser path.** Previously, `new ElysiaAdapter({ bodyLimit: 1024 })` was silently a no-op unless `rawBody` or a custom parser was registered — Elysia's default parser would buffer bodies of any size. The limit is now applied via an `onRequest` Content-Length guard on every request, plus the existing streaming guard for raw/custom parser paths.
- **`trustProxy: <number>` now matches Express's hop-count semantics.** Previously `trustProxy: 1` returned the *rightmost* X-Forwarded-For entry (the immediate proxy address), opposite of Express. It now returns the entry one hop to the left of the rightmost trusted hop. This is a breaking change for anyone relying on the inverted behavior; migrating from Express now requires no semantics translation.
- **`trustProxy: true` warns in production.** The leftmost X-Forwarded-For entry is client-controlled and only safe when every hop in front of the server overwrites the header. The adapter now logs a warning at startup when `trustProxy: true` is used with `NODE_ENV=production`.
- **`X-Forwarded-Host` regex tightened.** The strict-host validator now rejects malformed structures (consecutive dots, leading/trailing dots, single-character TLDs, ports outside `1–65535`) that the old loose pattern accepted. Falls back to the URL host when the header is invalid.
- **WebSocket handler errors are no longer silently swallowed.** Synchronous exceptions thrown by `@SubscribeMessage` handlers, guards, pipes, or interceptors now route through NestJS's WS exception filter chain and back to the client. Compatibility with `BaseWsExceptionFilter` is provided through a new `ElysiaWsClient.emit()` method.
- **WebSocket inbound payloads get a depth/key-count guard.** Defaults: `maxJsonDepth: 32`, `maxJsonKeys: 1024`. Payloads that exceed either are dropped with a `Payload too complex` envelope before `JSON.parse` runs, preventing parse-cost amplification DoS within the size limit.
- **WebSocket size check uses precise UTF-8 byte counting.** The old `raw.length * 4` upper bound over-rejected ASCII payloads by 4×. The fast path now uses `raw.length` for short-circuit and `Buffer.byteLength(raw, 'utf-8')` only when the cheap check is ambiguous.
- **`exposeErrorMessages` now accepts a sanitizer callback.** `(err) => string` lets you decide per-error which messages to surface — safer than the binary `true`/`false` toggle.
- **`BodyTooLargeError` response now includes the `error` field** to match NestJS's standard envelope shape (`{statusCode, message, error}`).
- **Error bridge no longer falls through to Elysia's raw renderer** when `errorHandler` is unset. Returns a sanitized `500 Internal Server Error` JSON envelope and logs the original error server-side, so pre-init errors and middleware throws don't leak `Error.message` / stack traces to the client.

### Added

- `useBodyParser(type, options?, parser?)` now reads `bodyLimit` and `rawBody` from the options object (in addition to the legacy `(type, rawBody, options, parser)` form NestJS uses internally), enabling per-content-type body limits via `app.useBodyParser('application/json', { bodyLimit: 32 * 1024 })`.
- New WebSocket helpers in `test/helpers/create-ws-app.ts` (`createWsApp`, `connectWs`, `listenForMessage`) that wrap the bootstrap + port binding pattern, with a `try/finally` guard so failed bootstraps don't leak sockets.
- `bunfig.toml` with explicit test timeout (15 s) and coverage reporter configuration.
- `test:security` and `test:coverage` scripts in `package.json`.
- New coverage for previously untested scenarios: VersioningType.CUSTOM, MEDIA_TYPE with reordered Accept parameters, explicit-unknown-version → 404, handlers throwing non-Error values, redirect preserving Set-Cookie headers, WS oversized envelope, WS handler throw via `WsException`, `exposeErrorMessages` sanitizer callback, WS JSON depth guard.

### Changed

- Pinned Bun to `1.3.13` in all CI workflows (`ci.yml`, `release.yml`, `docs.yml`) instead of `latest`. Added `actions/cache@v4` for `~/.bun/install/cache` keyed by `bun.lock`.
- CI now runs `bun test --coverage --coverage-reporter=lcov` and uploads to Codecov (no fail-on-error to keep CI green during early adoption).
- `enableCors()` no longer masks `cors()` configuration errors as "not installed" — the underlying error is preserved via `Error.cause` and only the require failure produces the install-hint message.
- `HttpServerProxy` pre-registers a noop `error` listener so `emit('error', ...)` from `listen()` failures never crashes the process before user code attaches.
- `HttpServerProxy.address().family` now correctly returns `'IPv6'` for IPv6 hostnames.
- `MEDIA_TYPE` versioning parser now finds the version key in any position of the Accept header, not only the second `;`-delimited parameter. Previously `Accept: application/json; charset=utf-8; v=1` silently returned `VERSION_NEUTRAL`.
- `registerRoute()` validates that the handler argument is a function and throws a clear `TypeError` with the method+path on misuse, instead of crashing opaquely at dispatch time.
- `methodEnumToString` is now exhaustive over `RequestMethod` — the `ALL` enum value is matched explicitly.
- `ElysiaRequest.url`, `.hostname`, and `.protocol` are memoized per request — NestJS core reads these multiple times per request (router, guards, interceptors), and the repeated regex tests / string concatenations are now done once.
- Middleware dispatcher's per-request wrappers (`ElysiaRequest`, `ElysiaReply`) are only allocated when at least one registered middleware matches the request path. Requests that don't trigger any middleware skip the allocation entirely.
- Middleware dispatcher race condition fixed: the per-middleware `Promise` is now resolved exactly once via a `settled` guard. Previously, an async middleware that called `next()` *and* returned a Promise could resolve twice and clobber `nextErr` non-deterministically.
- Public API surface tightened ahead of 1.0: `src/index.ts`, `src/adapters/index.ts`, `src/interfaces/index.ts`, and `src/decorators/index.ts` now use explicit named exports instead of `export *`. Internal-only types (`RawElysiaWs`, `BunServerWebSocket`) are no longer re-exported.
- `@RouteConfig` no longer accepts a `tags` field — it was a silent no-op (Elysia ignores `tags` at the top level of `localHook`). Use `@RouteDetail({ tags: [...] })` for OpenAPI tags.
- All four route decorators are now typed as `MethodDecorator` to surface mis-application at the class level at compile time.
- `ElysiaReply._toResponse()` now reconstructs the redirect response with the full `Set-Cookie` / custom header set instead of dropping everything except `Location`. Streaming responses likewise carry the full header bag.

### Types

- `NestElysiaApplication.useBodyParser` signature aligned to NestJS's `(type, options?, parser?)` proxy form (NestJS injects `rawBody` internally before calling the adapter).
- `versionMatches` short-circuits scalar-vs-scalar comparison without allocating intermediate arrays.

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
