import type { ElysiaConfig } from 'elysia';

export type TrustProxyResolver = (
  forwardedFor: string[],
  directIp: string | undefined,
) => string | undefined;

export type TrustProxyOption = boolean | number | TrustProxyResolver;

export type ElysiaAdapterOptions = ElysiaConfig<string> & {
  trustProxy?: TrustProxyOption;
  /**
   * Maximum body size (in bytes) the adapter will accept. Requests with a
   * Content-Length header above this size are rejected with 413 before the
   * body is read. For raw body or custom parser paths, the limit is also
   * enforced via streaming. Defaults to 1 MiB. Set to 0 to disable.
   */
  bodyLimit?: number;
};
