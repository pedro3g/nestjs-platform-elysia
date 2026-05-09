import type { ElysiaConfig } from 'elysia';

export type TrustProxyResolver = (
  forwardedFor: string[],
  directIp: string | undefined,
) => string | undefined;

export type TrustProxyOption = boolean | number | TrustProxyResolver;

export type ElysiaAdapterOptions = ElysiaConfig<string> & {
  trustProxy?: TrustProxyOption;
  /**
   * Maximum body size (in bytes) the adapter will accept when raw body capture
   * or a custom parser is in effect. Requests above this size are rejected with
   * 413. Defaults to 1 MiB. Set to 0 to disable.
   */
  bodyLimit?: number;
};
