import { spec } from 'pactum';
import { TestSetup } from '../setup/test-setup';
import { TestHelpers } from '../setup/test-helpers';
import { notIncludes } from 'pactum-matchers';

describe('User (e2e)', () => {
  describe('GET /users/me', () => {
    describe('Success Cases', () => {
      it('should get current user info successfully', async () => {
        const { sessionCookieStoreKey, userData } =
          await TestHelpers.createUserWithSession('get-me');

        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
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
            id: userData.id,
            email: userData.email,
            role: 'USER',
          });
      });

      it('should not include password in response', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('no-password');

        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
          .expectJsonMatch(
            notIncludes(['password', 'passwordHash', 'hashedPassword']),
          );
      });

      it('should work immediately after login', async () => {
        const { credentials } =
          await TestHelpers.createUser('immediate-access');
        const { sessionCookieStoreKey, userData } =
          await TestHelpers.loginUser(credentials);

        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
          .expectBodyContains(userData.email);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await TestHelpers.validateUnauthenticatedRejection('/users/me');
      });

      it('should fail with invalid session cookie', async () => {
        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies('invalid-session-cookie')
          .expectStatus(403);
      });
    });
  });

  describe('PUT /users/me', () => {
    describe('Email Updates', () => {
      it('should update user email successfully', async () => {
        const { credentials, sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('update-email');
        const newEmail = TestHelpers.generateUniqueUser('updated').email;
        const password = credentials.password;

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: newEmail,
            currentPassword: password,
          })
          .expectStatus(200)
          .expectJsonMatch({
            email: newEmail,
          });

        // Verify the change persists
        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
          .expectBodyContains(newEmail);
      });

      it('should trim and lowercase email updates', async () => {
        const { sessionCookieStoreKey, credentials } =
          await TestHelpers.createUserWithSession('trim-email');
        const emailWithSpaces = `  ${credentials.email.toUpperCase()}  `;
        const password = credentials.password;

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: emailWithSpaces,
            currentPassword: password,
          })
          .expectStatus(200)
          .expectBodyContains(credentials.email);
      });

      it('should not allow updating to existing email', async () => {
        // Create two users
        const user1 = await TestHelpers.createUserWithSession('existing1');
        const user2 = await TestHelpers.createUserWithSession('existing2');

        // Try to update user2's email to user1's email
        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
          .withBody({
            email: user1.credentials.email,
            currentPassword: user2.credentials.password,
          })
          .expectStatus(403);
      });
    });

    describe('Password Updates', () => {
      it('should update user password successfully', async () => {
        const { credentials } = await TestHelpers.createUser('password-update');
        const { sessionCookieStoreKey } =
          await TestHelpers.loginUser(credentials);
        const newPassword = `new-${Date.now()}`;

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            password: newPassword,
            currentPassword: credentials.password,
          })
          .expectStatus(200);

        // Verify can login with new password
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email,
            password: newPassword,
          })
          .expectStatus(200);

        // Verify cannot login with old password
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody(credentials)
          .expectStatus(403);
      });

      it('should update both email and password', async () => {
        const { credentials } = await TestHelpers.createUser('both-update');
        const { sessionCookieStoreKey } =
          await TestHelpers.loginUser(credentials);

        const newEmail = TestHelpers.generateUniqueUser('both-updated').email;
        const newPassword = `new-${Date.now()}`;

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: newEmail,
            password: newPassword,
            currentPassword: credentials.password,
          })
          .expectStatus(200)
          .expectBodyContains(newEmail);

        // Verify can login with new credentials
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody({
            email: newEmail,
            password: newPassword,
          })
          .expectStatus(200);
      });
    });

    describe('Session Maintenance', () => {
      it('should maintain session after profile update', async () => {
        const { sessionCookieStoreKey, credentials } =
          await TestHelpers.createUserWithSession('session-maintain');
        const newEmail = TestHelpers.generateUniqueUser('maintained').email;

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: newEmail,
            currentPassword: credentials.password,
          })
          .expectStatus(200);

        // Session should still work
        await TestHelpers.validateAuthenticatedAccess(sessionCookieStoreKey);
      });
    });

    describe('Validation Errors', () => {
      it('should fail with wrong current password', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('wrong-password');

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: 'shouldfail@gmail.com',
            currentPassword: 'wrongpassword',
          })
          .expectStatus(403);
      });

      it('should fail without current password', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('no-current-password');

        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            email: 'shouldfail@gmail.com',
          })
          .expectStatus(400);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withBody({
            email: 'test@gmail.com',
            currentPassword: 'password123',
          })
          .expectStatus(403);
      });
    });
  });

  describe('DELETE /users/me', () => {
    describe('Success Cases', () => {
      it('should delete current user account successfully', async () => {
        const { credentials } = await TestHelpers.createUser('delete-success');
        const { sessionCookieStoreKey } =
          await TestHelpers.loginUser(credentials);

        await spec()
          .delete(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            currentPassword: credentials.password,
            confirmationText: 'DELETE MY ACCOUNT',
          })
          .expectStatus(204);

        // Session should be invalidated
        await spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(403);

        // Verify user can no longer login
        await spec()
          .post(`${TestSetup.baseUrl}/auth/login`)
          .withBody(credentials)
          .expectStatus(403);
      });
    });

    describe('Validation Errors', () => {
      it('should fail with wrong current password', async () => {
        const { sessionCookieStoreKey } =
          await TestHelpers.createUserWithSession('delete-wrong-password');

        await spec()
          .delete(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .withBody({
            currentPassword: 'wrongpassword',
            confirmationText: 'DELETE MY ACCOUNT',
          })
          .expectStatus(403);
      });

      it.each([
        {
          case: 'wrong confirmation text',
          confirmationText: 'DELETE ACCOUNT',
          expectedError: 'DELETE MY ACCOUNT',
        },
        {
          case: 'case-sensitive confirmation text',
          confirmationText: 'delete my account',
          expectedError: 'DELETE MY ACCOUNT',
        },
        {
          case: 'missing confirmation text',
          confirmationText: undefined,
          expectedError: 'confirmationText',
        },
      ])(
        'should fail with $case',
        async ({ confirmationText, expectedError }) => {
          const { sessionCookieStoreKey } =
            await TestHelpers.createUserWithSession('delete-validation');

          const base = { currentPassword: 'password123' } as const;
          const body =
            confirmationText !== undefined
              ? { ...base, confirmationText }
              : base;

          await spec()
            .delete(`${TestSetup.baseUrl}/users/me`)
            .withCookies(`$S{${sessionCookieStoreKey}}`)
            .withBody(body)
            .expectStatus(400)
            .expectBodyContains(expectedError);
        },
      );
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await spec()
          .delete(`${TestSetup.baseUrl}/users/me`)
          .withBody({
            currentPassword: 'password123',
            confirmationText: 'DELETE MY ACCOUNT',
          })
          .expectStatus(403);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle special characters in user data', async () => {
      const specialEmail = `special+chars-${Date.now()}@gmail.com`;
      const specialPassword = 'p@ssw0rd!#$%^&*()';

      await spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody({
          email: specialEmail,
          password: specialPassword,
        })
        .expectStatus(201)
        .expectBodyContains(specialEmail);
    });

    it('should handle null and undefined values appropriately', async () => {
      const { sessionCookieStoreKey } =
        await TestHelpers.createUserWithSession('null-handling');

      await spec()
        .put(`${TestSetup.baseUrl}/users/me`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .withBody({
          email: null,
          currentPassword: 'password123',
        })
        .expectStatus(400);
    });

    it('should handle rapid successive requests', async () => {
      const { sessionCookieStoreKey } =
        await TestHelpers.createUserWithSession('rapid-requests');

      const rapidRequests = Array.from({ length: 5 }, () =>
        spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200),
      );

      await Promise.all(rapidRequests);
    });
  });
});
