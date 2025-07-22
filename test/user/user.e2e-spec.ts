import { spec } from 'pactum';
import { TestSetup as s } from '../setup/test-setup';
import { TestHelpers as h } from '../setup/test-helpers';
import { TestAssertions as a } from '../setup/test-assertions';
import { TestDataFactory as f } from '../setup/test-data-factory';

describe('User (e2e)', () => {
  describe('GET /users/me', () => {
    describe('Success Cases', () => {
      it('should get current user info successfully', async () => {
        const { sessionKey, userData } =
          await h.createUserWithSession('get-me');

        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expect('validUserResponse', {
            id: userData.id,
            email: userData.email,
            role: 'USER',
          });
      });

      it('should not include password in response', async () => {
        const { sessionKey } = await h.createUserWithSession('no-password');

        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expect('validUserResponse');
      });

      it('should work immediately after login', async () => {
        const { credentials } = await h.createUser('immediate-access');
        const { sessionKey, userData } = await h.loginUser(credentials);

        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expectStatus(200)
          .expectBodyContains(userData.email);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await a.validateUnauthenticatedRejection('/users/me');
      });

      it('should fail with invalid session cookie', async () => {
        await spec()
          .get(`${s.baseUrl}/users/me`)
          .withCookies('invalid-session-cookie')
          .expect('authFailure');
      });
    });
  });

  describe('PUT /users/me', () => {
    describe('Email Updates', () => {
      it('should update user email successfully', async () => {
        const { credentials, sessionKey } =
          await h.createUserWithSession('update-email');
        const updateData = f.createUpdateScenarios(credentials).emailOnly();

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody(updateData)
          .expect('validUserResponse', {
            email: updateData.email,
          });

        // Verify the change persists
        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expectStatus(200)
          .expectBodyContains(updateData.email!);
      });

      it('should trim and lowercase email updates', async () => {
        const { sessionKey, credentials } =
          await h.createUserWithSession('trim-email');
        const updateData = f.createUpdateScenarios(credentials).trimmedEmail();
        const expectedEmail = updateData.email!.trim().toLowerCase();

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody(updateData)
          .expectStatus(200)
          .expectBodyContains(expectedEmail);
      });

      it('should not allow updating to existing email', async () => {
        // Create two users
        const user1 = await h.createUserWithSession('existing1');
        const user2 = await h.createUserWithSession('existing2');

        // Try to update user2's email to user1's email
        await h
          .authenticatedRequest(user2.sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody({
            email: user1.credentials.email,
            currentPassword: user2.credentials.password,
          })
          .expect('authFailure');
      });
    });

    describe('Password Updates', () => {
      it('should update user password successfully', async () => {
        const { credentials } = await h.createUser('password-update');
        const { sessionKey } = await h.loginUser(credentials);
        const updateData = f.createUpdateScenarios(credentials).passwordOnly();

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody(updateData)
          .expectStatus(200);

        // Verify can login with new password
        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email,
            password: updateData.password!,
          })
          .expectStatus(200);

        // Verify cannot login with old password
        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody(credentials)
          .expect('authFailure');
      });

      it('should update both email and password', async () => {
        const { credentials } = await h.createUser('both-update');
        const { sessionKey } = await h.loginUser(credentials);
        const updateData = f.createUpdateScenarios(credentials).both();

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody(updateData)
          .expectStatus(200)
          .expectBodyContains(updateData.email!);

        // Verify can login with new credentials
        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody({
            email: updateData.email!,
            password: updateData.password!,
          })
          .expectStatus(200);
      });
    });

    describe('Session Maintenance', () => {
      it('should maintain session after profile update', async () => {
        const { sessionKey, credentials } =
          await h.createUserWithSession('session-maintain');
        const updateData = f.createUpdateScenarios(credentials).emailOnly();

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody(updateData)
          .expectStatus(200);

        // Session should still work
        await a.validateAuthenticatedAccess(sessionKey);
      });
    });

    describe('Validation Errors', () => {
      it('should fail with wrong current password', async () => {
        const { sessionKey } = await h.createUserWithSession('wrong-password');

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody({
            email: f.EMAIL_PATTERNS.valid('shouldfail'),
            currentPassword: 'wrongpassword',
          })
          .expect('authFailure');
      });

      it('should fail without current password', async () => {
        const { sessionKey } = await h.createUserWithSession(
          'no-current-password',
        );

        await h
          .authenticatedRequest(sessionKey)
          .put(`${s.baseUrl}/users/me`)
          .withBody({
            email: f.EMAIL_PATTERNS.valid('shouldfail'),
          })
          .expect('validationError', 'currentPassword');
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await spec()
          .put(`${s.baseUrl}/users/me`)
          .withBody({
            email: f.EMAIL_PATTERNS.valid('test'),
            currentPassword: 'password123',
          })
          .expect('authFailure');
      });
    });
  });

  describe('DELETE /users/me', () => {
    describe('Success Cases', () => {
      it('should delete current user account successfully', async () => {
        const { credentials } = await h.createUser('delete-success');
        const { sessionKey } = await h.loginUser(credentials);
        const deleteData = f.createValidDeleteData(credentials.password);

        await h
          .authenticatedRequest(sessionKey)
          .delete(`${s.baseUrl}/users/me`)
          .withBody(deleteData)
          .expectStatus(204);

        // Session should be invalidated
        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expect('authFailure');

        // Verify user can no longer login
        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody(credentials)
          .expect('authFailure');
      });
    });

    describe('Validation Errors', () => {
      it('should fail with wrong current password', async () => {
        const { sessionKey } = await h.createUserWithSession(
          'delete-wrong-password',
        );

        await h
          .authenticatedRequest(sessionKey)
          .delete(`${s.baseUrl}/users/me`)
          .withBody({
            currentPassword: 'wrongpassword',
            confirmationText: 'DELETE MY ACCOUNT',
          })
          .expect('authFailure');
      });

      it.each(f.createDeleteScenarios('password123'))(
        'should fail with $case',
        async ({ data, expectedField }) => {
          const { sessionKey } =
            await h.createUserWithSession('delete-validation');

          await h
            .authenticatedRequest(sessionKey)
            .delete(`${s.baseUrl}/users/me`)
            .withBody(data)
            .expect('validationError', expectedField);
        },
      );
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await spec()
          .delete(`${s.baseUrl}/users/me`)
          .withBody(f.createValidDeleteData('password123'))
          .expect('authFailure');
      });
    });
  });
});
