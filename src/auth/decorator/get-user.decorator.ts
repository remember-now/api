import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UserWithoutPassword } from '@/user/dto';

export const GetUser = createParamDecorator(
  (data: keyof UserWithoutPassword | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: UserWithoutPassword }>();
    if (data && data in request.user) {
      return request.user[data];
    }
    return request.user;
  },
);
