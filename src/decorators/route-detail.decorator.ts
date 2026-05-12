import { SetMetadata } from '@nestjs/common';
import { ELYSIA_ROUTE_DETAIL_METADATA } from '../constants';

export interface RouteDetailOptions {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  hide?: boolean;
  [key: string]: unknown;
}

export const RouteDetail = (detail: RouteDetailOptions): MethodDecorator =>
  SetMetadata(ELYSIA_ROUTE_DETAIL_METADATA, detail);
