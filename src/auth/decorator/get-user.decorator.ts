import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from 'generated/prisma';

export const GetUser = createParamDecorator(
  (
    data: keyof Omit<User, 'passwordHash'> | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: Omit<User, 'passwordHash'> }>();
    if (data && data in request.user) {
      return request.user[data];
    }
    return request.user;
  },
);
