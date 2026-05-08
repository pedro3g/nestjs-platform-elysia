import { SetMetadata } from '@nestjs/common';
import { ELYSIA_ROUTE_SCHEMA_METADATA } from '../constants';

export interface RouteSchemaOptions {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
  cookie?: unknown;
  response?: unknown;
}

export const RouteSchema = (schema: RouteSchemaOptions) =>
  SetMetadata(ELYSIA_ROUTE_SCHEMA_METADATA, schema);
