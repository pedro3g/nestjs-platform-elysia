---
title: Trust Proxy
description: Honor X-Forwarded-* headers when your app sits behind a reverse proxy.
sidebar:
  order: 4
---

When the app sits behind a reverse proxy — Cloudflare, AWS ALB, nginx, Caddy, Fly.io's edge, etc. — `request.ip` reports the proxy's IP and `request.hostname` the internal name. To get the real client values, opt into trust proxy.

## Three ways to opt in

The `trustProxy` option accepts three shapes, ordered from loosest to strictest:

### `trustProxy: true` — trust everything

```ts
new ElysiaAdapter({ trustProxy: true });
```

`request.ip` resolves to the **leftmost** entry in `X-Forwarded-For`. The leftmost entry is, by RFC convention, the client's own claim — so this mode is only safe when **every hop** in front of the server overwrites the header. Use this when:

- You run behind a managed CDN/proxy (Cloudflare, AWS ALB, Fastly) that you've configured to strip and rewrite XFF.
- The server is not reachable directly (no public IP, no debug port).

In `NODE_ENV=production`, the adapter logs a warning so this choice is deliberate.

### `trustProxy: <number>` — Express hop count

```ts
new ElysiaAdapter({ trustProxy: 1 });
```

Trust the rightmost N entries of `X-Forwarded-For` and resolve to the entry one hop further left. This matches Express's `app.set('trust proxy', N)` semantics exactly.

For `X-Forwarded-For: 1.2.3.4, 5.6.7.8, 9.10.11.12`:

| `trustProxy` | Resolved `request.ip` |
|---|---|
| `1` | `5.6.7.8` (one to the left of the rightmost trusted hop) |
| `2` | `1.2.3.4` (two hops back — the original client) |
| `3` | `1.2.3.4` (falls back to the leftmost when count ≥ length) |

Use this when you know exactly how many trusted proxies sit in front of the server.

### `trustProxy: <function>` — custom resolver

For more control — trusting only specific proxies, walking N hops back, CIDR allowlists, etc. — pass a function. The resolver receives the parsed `X-Forwarded-For` list and the direct connection IP, and returns the resolved client IP (or `undefined` to use the direct IP).

```ts
new ElysiaAdapter({
  trustProxy: (forwardedFor, directIp) => {
    return forwardedFor[forwardedFor.length - 1];
  },
});
```

```ts
new ElysiaAdapter({
  trustProxy: (forwardedFor, directIp) => {
    const cloudflareIPs = ['173.245.48.0/20', '103.21.244.0/22'];
    if (!directIp || !cloudflareIPs.some((cidr) => inCidr(directIp, cidr))) {
      return directIp;
    }
    return forwardedFor[0];
  },
});
```

## Reading the resolved values

`request.ip`, `request.hostname` and `request.protocol` are getters on `ElysiaRequest`. Inject the request into your controller via `@Req()`:

```ts
import { Controller, Get, Req } from '@nestjs/common';
import type { ElysiaRequest } from 'nestjs-platform-elysia';

@Controller()
export class WhoamiController {
  @Get('whoami')
  whoami(@Req() req: ElysiaRequest) {
    return {
      ip: req.ip,
      hostname: req.hostname,
      protocol: req.protocol,
    };
  }
}
```

## Default: off

`trustProxy` defaults to `false`. `request.ip` returns the direct TCP connection IP, `request.hostname` parses from the `Host` header on the actual request URL, and `request.protocol` reads from the request URL. **Never enable trust proxy unless your app is actually behind a proxy you trust** — otherwise clients can spoof `X-Forwarded-For`.

## Header sanitization

When `trustProxy` is on, all four headers are validated before use:

- `X-Forwarded-For` — every entry is checked with `node:net.isIP()`; invalid entries are dropped before the resolver runs.
- `X-Real-IP` — must pass `isIP()` or it is ignored.
- `X-Forwarded-Proto` — only `http` and `https` (case-insensitive) are accepted; anything else falls back to the parsed URL protocol.
- `X-Forwarded-Host` — a strict regex enforces RFC-shaped hostnames (no spaces, no CRLF, no control characters) with a port between 1–65535. Garbage values fall back to the URL host.

These defenses harden the trust path against header injection, log poisoning, and cache-key spoofing.
