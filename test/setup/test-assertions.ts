import { spec, handler } from 'pactum';
import { TestSetup } from './test-setup';
import { TestHelpers } from './test-helpers';
import {
  AuthResponse,
  MessageResponse,
  UserResponse,
  ValidationErrorResponse,
} from 'test/types';
import { ExpectHandlerContext } from 'pactum/src/exports/handler';

export class TestAssertions {
  private static isUserResponse(data: unknown): data is UserResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.id === 'number' &&
      typeof obj.email === 'string' &&
      typeof obj.role === 'string' &&
      typeof obj.createdAt === 'string' &&
      typeof obj.updatedAt === 'string'
    );
  }

  private static isAuthResponse(data: unknown): data is AuthResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return typeof obj.message === 'string' && this.isUserResponse(obj.user);
  }

  private static isValidationErrorResponse(
    data: unknown,
  ): data is ValidationErrorResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.statusCode === 'number' &&
      typeof obj.message === 'string' &&
      Array.isArray(obj.errors)
    );
  }

  private static isMessageResponse(data: unknown): data is MessageResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return typeof obj.message === 'string';
  }

  /**
   * Initialize custom expect handlers
   */
  static initializeHandlers(): void {
    handler.addExpectHandler(
      'validUserResponse',
      (ctx: ExpectHandlerContext) => {
        if (ctx.res.statusCode !== 200 && ctx.res.statusCode !== 201) {
          throw new Error(
            `Expected status 200 or 201 but got ${ctx.res.statusCode}`,
          );
        }
        if (!this.isUserResponse(ctx.res.json)) {
          throw new Error('Response is not a valid user response');
        }
        const body = ctx.res.json;

        const forbiddenFields = ['password', 'passwordHash', 'hashedPassword'];
        for (const field of forbiddenFields) {
          if (field in body) {
            throw new Error(`Response should not contain field: ${field}`);
          }
        }
        // Validate specific user data if provided
        const userData = ctx.data as Partial<UserResponse>;

        if (userData) {
          for (const [key, value] of Object.entries(userData)) {
            if (body[key] !== value) {
              throw new Error(
                `Expected ${key} to be ${String(value)} but got ${String(body[key])}`,
              );
            }
          }
        }
      },
    );

    handler.addExpectHandler('successfulAuth', (ctx: ExpectHandlerContext) => {
      if (ctx.res.statusCode !== 200) {
        throw new Error(`Expected status 200 but got ${ctx.res.statusCode}`);
      }
      if (!this.isAuthResponse(ctx.res.json)) {
        throw new Error('Response is not a valid auth response');
      }
      const body = ctx.res.json;

      if (body.message !== 'Login successful') {
        throw new Error(
          `Expected message 'Login successful' but got '${body.message}'`,
        );
      }
      // Validate user data if provided
      const userData = ctx.data as Partial<UserResponse>;

      if (userData) {
        for (const [key, value] of Object.entries(userData)) {
          if (body.user[key] !== value) {
            throw new Error(
              `Expected user.${key} to be ${String(value)} but got ${String(body.user[key])}`,
            );
          }
        }
      }
    });

    // Handler for validation errors based on Zod error structure
    handler.addExpectHandler('validationError', (ctx: ExpectHandlerContext) => {
      if (typeof ctx.data !== 'string') {
        throw new Error('Field path must be a string');
      }
      const fieldPath = ctx.data;
      if (!fieldPath) {
        throw new Error('Field path is required for validation error handler');
      }

      if (ctx.res.statusCode !== 400) {
        throw new Error(`Expected status 400 but got ${ctx.res.statusCode}`);
      }
      if (!this.isValidationErrorResponse(ctx.res.json)) {
        throw new Error('Response is not a valid validation error response');
      }
      const body = ctx.res.json;

      const hasFieldError = body.errors.some(
        (error) =>
          (error.path && error.path.includes(fieldPath)) ||
          (error.code === 'custom' && fieldPath === 'custom'),
      );
      if (!hasFieldError) {
        throw new Error(
          `Expected validation error for field '${fieldPath}' but not found in errors`,
        );
      }
    });

    handler.addExpectHandler('authFailure', (ctx: ExpectHandlerContext) => {
      if (ctx.res.statusCode !== 403) {
        throw new Error(`Expected status 403 but got ${ctx.res.statusCode}`);
      }
    });

    handler.addExpectHandler(
      'successfulLogout',
      (ctx: ExpectHandlerContext) => {
        if (ctx.res.statusCode !== 200) {
          throw new Error(`Expected status 200 but got ${ctx.res.statusCode}`);
        }
        if (!this.isMessageResponse(ctx.res.json)) {
          throw new Error('Response is not a valid message response');
        }

        const body = ctx.res.json;
        if (body.message !== 'Logout successful') {
          throw new Error(
            `Expected message 'Logout successful' but got '${body.message}'`,
          );
        }
      },
    );
  }

  /**
   * Validate authenticated access to protected endpoint
   */
  static async validateAuthenticatedAccess(
    sessionKey: string,
  ): Promise<UserResponse> {
    return await TestHelpers.authenticatedRequest(sessionKey)
      .get(`${TestSetup.baseUrl}/users/me`)
      .expect('validUserResponse')
      .returns('');
  }

  /**
   * Validate unauthenticated rejection for endpoints
   */
  static async validateUnauthenticatedRejection(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  ): Promise<void> {
    const url = `${TestSetup.baseUrl}${endpoint}`;

    switch (method) {
      case 'GET':
        await spec().get(url).expect('authFailure');
        break;
      case 'POST':
        await spec().post(url).expect('authFailure');
        break;
      case 'PUT':
        await spec().put(url).expect('authFailure');
        break;
      case 'DELETE':
        await spec().delete(url).expect('authFailure');
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method as string}`);
    }
  }
}
