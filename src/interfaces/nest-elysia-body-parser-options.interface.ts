export interface NestElysiaBodyParserOptions {
  bodyLimit?: number;
  parseAs?: 'json' | 'text' | 'buffer' | 'arrayBuffer';
  [key: string]: unknown;
}
