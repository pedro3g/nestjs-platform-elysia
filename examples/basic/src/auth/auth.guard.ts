import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

interface AuthRequest {
  headers: Record<string, string | undefined>;
  user?: { id: string; roles: string[] };
}

const TOKENS: Record<string, { id: string; roles: string[] }> = {
  'admin-token': { id: 'u1', roles: ['admin'] },
  'user-token': { id: 'u2', roles: ['user'] },
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const auth = request.headers.authorization ?? request.headers.Authorization;
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = auth.slice('Bearer '.length).trim();
    const user = TOKENS[token];
    if (!user) throw new UnauthorizedException('Invalid token');

    request.user = user;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      const hasRole = required.some((r) => user.roles.includes(r));
      if (!hasRole) throw new ForbiddenException(`Requires role: ${required.join(' or ')}`);
    }

    return true;
  }
}
