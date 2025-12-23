import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { LoggedInGuard } from './logged-in.guard';

@Injectable()
export class AdminGuard extends LoggedInGuard {
  override canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & {
        session: { passport?: { user?: { role?: string } } };
      }
    >();

    return (
      super.canActivate(context) &&
      req.session?.passport?.user?.role === 'ADMIN'
    );
  }
}
