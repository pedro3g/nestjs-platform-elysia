---
title: Trust Proxy
description: Honor X-Forwarded-* headers when your app sits behind a reverse proxy.
sidebar:
  order: 4
---

When the app sits behind a reverse proxy — Cloudflare, AWS ALB, nginx, Caddy, Fly.io's edge, etc. — `request.ip` reports the proxy's IP and `request.hostname` the internal name. To get the real client values, opt into trust proxy.

## Enable globally

```ts
new ElysiaAdapter({ trustProxy: true });
```

When enabled:

- `request.ip` resolves to the **leftmost** entry in `X-Forwarded-For` (with `X-Real-IP` as fallback).
- `request.hostname` reads `X-Forwarded-Host`.
- `request.protocol` reads `X-Forwarded-Proto`.

If no proxy header is present, all three fall back to the direct connection values.

## Custom resolver

For more control — trusting only specific proxies, walking N hops back, CIDR allowlists, etc. — pass a function instead of `true`. The resolver receives the parsed `X-Forwarded-For` list and the direct connection IP, and returns the resolved client IP (or `undefined` to use the direct IP).

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
