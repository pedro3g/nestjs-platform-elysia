export interface NestElysiaBodyParserOptions {
  bodyLimit?: number;
  parseAs?: 'json' | 'text' | 'buffer' | 'arrayBuffer';
  rawBody?: boolean;
  [key: string]: unknown;
}

export type BodyParserContext = {
  request: Request;
  contentType: string;
  rawBody: Buffer;
};

export type BodyParserHandler = (ctx: BodyParserContext) => unknown | Promise<unknown>;
