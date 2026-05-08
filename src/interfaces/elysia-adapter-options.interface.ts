import type { ElysiaConfig } from 'elysia';

export type TrustProxyResolver = (
  forwardedFor: string[],
  directIp: string | undefined,
) => string | undefined;

export type TrustProxyOption = boolean | TrustProxyResolver;

export type ElysiaAdapterOptions = ElysiaConfig<string> & {
  trustProxy?: TrustProxyOption;
};
