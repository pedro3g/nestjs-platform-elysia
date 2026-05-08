import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CallHandler,
  type CanActivate,
  Controller,
  type ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  type NestInterceptor,
  Param,
  ParseIntPipe,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

const ROLES = 'roles';
const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);

@Injectable()
class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { roles: string[] };
    }>();
    const auth = req.headers.authorization;
    if (auth !== 'Bearer admin' && auth !== 'Bearer user') {
      throw new UnauthorizedException('no token');
    }
    const role = auth === 'Bearer admin' ? 'admin' : 'user';
    req.user = { roles: [role] };
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !required.some((r) => req.user!.roles.includes(r))) {
      throw new ForbiddenException(`needs ${required.join(',')}`);
    }
    return true;
  }
}

@Injectable()
class WrapInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => ({ data, wrapped: true })));
  }
}

@Controller('protected')
@UseGuards(AuthGuard)
class ProtectedController {
  @Get('public')
  pub() {
    return { ok: true };
  }

  @Get('admin')
  @Roles('admin')
  adminOnly() {
    return { secret: 42 };
  }

  @Post('echo/:id')
  echo(@Param('id', ParseIntPipe) id: number) {
    return { id, type: typeof id };
  }

  @Get('wrapped')
  @UseInterceptors(WrapInterceptor)
  wrapped() {
    return { value: 1 };
  }
}

@Module({ controllers: [ProtectedController], providers: [AuthGuard, WrapInterceptor] })
class GuardsModule {}

describe('e2e: guards/pipes/interceptors', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [GuardsModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('guard rejects without token (401)', async () => {
    const res = await inject(app, { url: '/protected/public' });
    expect(res.status).toBe(401);
  });

  test('guard accepts valid token', async () => {
    const res = await inject(app, {
      url: '/protected/public',
      headers: { authorization: 'Bearer user' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('roles guard returns 403 for wrong role', async () => {
    const res = await inject(app, {
      url: '/protected/admin',
      headers: { authorization: 'Bearer user' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('admin');
  });

  test('roles guard accepts admin role', async () => {
    const res = await inject(app, {
      url: '/protected/admin',
      headers: { authorization: 'Bearer admin' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ secret: 42 });
  });

  test('ParseIntPipe converts numeric string to number', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/protected/echo/42',
      headers: { authorization: 'Bearer admin' },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 42, type: 'number' });
  });

  test('ParseIntPipe rejects non-numeric param (400)', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/protected/echo/notnumber',
      headers: { authorization: 'Bearer admin' },
    });
    expect(res.status).toBe(400);
  });

  test('interceptor transforms response', async () => {
    const res = await inject(app, {
      url: '/protected/wrapped',
      headers: { authorization: 'Bearer user' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { value: 1 }, wrapped: true });
  });
});
