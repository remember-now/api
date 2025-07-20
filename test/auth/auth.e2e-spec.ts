import { spec } from 'pactum';
import { TestSetup } from '../setup/test-setup';
import { TestHelpers } from '../setup/test-helpers';

describe('Auth (e2e)', () => {
  describe('POST /auth/signup', () => {
    describe('Success Cases', () => {
      it('should signup successfully with valid data', async () => {
        const newUser = TestHelpers.generateUniqueUser('signup');

        await spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody(newUser)
          .expectStatus(201)
          .expectJsonSchema({
            type: 'object',
            properties: {
              id: { type: 'number' },
              email: { type: 'string' },
              role: { type: 'string' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
            required: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
          })
          .expectJsonMatch({
            email: newUser.email,
            role: 'USER',
          });
      });

      it('should trim and lowercase email', async () => {
        const timestamp = Date.now();
        const email = `  UPPERCASE-${timestamp}@GMAIL.COM  `;
        const expectedEmail = email.trim().toLowerCase();

        await spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody({
            email,
            password: 'password123',
          })
          .expectStatus(201)
          .expectBodyContains(expectedEmail);
      });
    });

    describe('Validation Errors', () => {
      it.each([
        {
          case: 'invalid email format',
          body: { email: 'invalid-email', password: 'password123' },
          expectedStatus: 400,
          expectedError: 'email',
        },
        {
          case: 'short password',
          body: { email: 'test@gmail.com', password: '123' },
          expectedStatus: 400,
          expectedError: 'Password must be at least 5 characters',
        },
        {
          case: 'missing email',
          body: { password: 'password123' },
          expectedStatus: 400,
          expectedError: 'email',
        },
        {
          case: 'missing password',
          body: { email: 'test@gmail.com' },
          expectedStatus: 400,
          expectedError: 'password',
        },
      ])(
        'should fail with $case',
        async ({ body, expectedStatus, expectedError }) => {
          await spec()
            .post(`${TestSetup.baseUrl}/auth/signup`)
            .withBody(body)
            .expectStatus(expectedStatus)
            .expectBodyContains(expectedError);
        },
      );
    });

    describe('Conflict Cases', () => {
      it('should fail with duplicate email', async () => {
        const user = TestHelpers.generateUniqueUser('duplicate');

        // First signup should succeed
        await spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody(user)
          .expectStatus(201);

        // Second signup should fail
        await spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody(user)
          .expectStatus(403);
      });
    });
  });

  describe('POST /auth/login', () => {
    describe('Success Cases', () => {
      it('should login successfully with correct credentials', async () => {
        const { credentials } = await TestHelpers.createUser('login-success');

        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody(credentials)
          .expectStatus(200)
          .expectJsonSchema({
            type: 'object',
            properties: {
              message: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
                required: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
              },
            },
            required: ['message', 'user'],
          })
          .expectJsonMatch({
            message: 'Login successful',
            user: {
              email: credentials.email,
              role: 'USER',
            },
          });
      });

      it('should handle case-insensitive email login', async () => {
        const { credentials } =
          await TestHelpers.createUser('case-insensitive');

        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email.toUpperCase(),
            password: credentials.password,
          })
          .expectStatus(200);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail with invalid password', async () => {
        const { credentials } =
          await TestHelpers.createUser('invalid-password');

        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email,
            password: 'wrongpassword',
          })
          .expectStatus(403);
      });

      it('should fail with non-existent email', async () => {
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody({
            email: 'nonexistent@gmail.com',
            password: 'password123',
          })
          .expectStatus(403);
      });
    });

    describe('Validation Errors', () => {
      it.each([
        {
          case: 'missing password',
          body: { email: 'test@gmail.com' },
        },
        {
          case: 'missing email',
          body: { password: 'password123' },
        },
      ])('should fail with $case', async ({ body }) => {
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody(body)
          .expectStatus(401);
      });
    });
  });

  describe('POST /auth/logout', () => {
    describe('Success Cases', () => {
      it('should logout successfully when authenticated', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('logout-success');

        await spec()
          .post(`${TestSetup.baseUrl}/auth/logout`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
          .expectJsonSchema({
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          })
          .expectJsonMatch({
            message: 'Logout successful',
          });
      });

      it('should invalidate session after logout', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('logout-invalidate');

        // Verify session works before logout
        await TestHelpers.validateAuthenticatedAccess(sessionCookieStoreKey);

        // Logout
        await TestHelpers.logoutUser(sessionCookieStoreKey);

        // Verify session is invalidated
        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(403);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await TestHelpers.validateUnauthenticatedRejection(
          '/auth/logout',
          'POST',
        );
      });

      it('should fail with invalid session cookie', async () => {
        await spec()
          .post(`${TestSetup.baseUrl}/auth/logout`)
          .withCookies('invalid-session-cookie')
          .expectStatus(403);
      });
    });
  });

  describe('Session Management', () => {
    it('should maintain session across multiple requests', async () => {
      const { sessionCookieStoreKey } =
        await TestHelpers.createUserWithSession('persistent-session');

      for (let i = 0; i < 3; i++) {
        await TestHelpers.validateAuthenticatedAccess(sessionCookieStoreKey);
      }
    });

    it('should handle multiple concurrent sessions for same user', async () => {
      const { credentials } = await TestHelpers.createUser(
        'concurrent-sessions',
      );

      // Create two sessions for the same user
      const session1 = await TestHelpers.loginUser(credentials);
      const session2 = await TestHelpers.loginUser(credentials);

      // Both sessions should work
      await TestHelpers.validateAuthenticatedAccess(
        session1.sessionCookieStoreKey,
      );
      await TestHelpers.validateAuthenticatedAccess(
        session2.sessionCookieStoreKey,
      );

      // Logout from first session
      await TestHelpers.logoutUser(session1.sessionCookieStoreKey);

      // First session should be invalid, second should still work
      await spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies(`$S{${session1.sessionCookieStoreKey}}`)
        .expectStatus(403);

      await TestHelpers.validateAuthenticatedAccess(
        session2.sessionCookieStoreKey,
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed request bodies gracefully', async () => {
      await spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody('invalid-json')
        .expectStatus(400);

      await spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withHeaders('Content-Type', 'application/json')
        .withBody('{"email": invalid}')
        .expectStatus(400);
    });

    it('should handle missing content-type header', async () => {
      await spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withHeaders('Content-Type', 'text/plain')
        .withBody(JSON.stringify(TestHelpers.generateUniqueUser()))
        .expectStatus(400);
    });
  });
});
