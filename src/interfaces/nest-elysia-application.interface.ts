import type { CORSConfig } from '@elysiajs/cors';
import type { HttpServer, INestApplication } from '@nestjs/common';
import type { AnyElysia } from 'elysia';
import type { ElysiaReply } from '../reply/elysia-reply';
import type { ElysiaRequest } from '../request/elysia-request';
import type {
  BodyParserHandler,
  NestElysiaBodyParserOptions,
} from './nest-elysia-body-parser-options.interface';

export interface NestElysiaApplication extends INestApplication {
  getHttpAdapter(): HttpServer<ElysiaRequest, ElysiaReply, AnyElysia>;
  register(plugin: unknown): this;
  mount(path: string, handler: unknown): this;
  inject(request: Request): Promise<Response>;
  useBodyParser(
    type: string | string[],
    options?: NestElysiaBodyParserOptions,
    parser?: BodyParserHandler,
  ): this;
  enableCors(options?: CORSConfig): this;
}
