import { spec, e2e } from 'pactum';
import {
  TestSetup as s,
  TestHelpers as h,
  TestAssertions as a,
  TestDataFactory as f,
} from 'test/setup';

describe('User Lifecycle Integration (e2e)', () => {
  describe('Complete User Journey', () => {
    const userLifecycleFlow = e2e('User Lifecycle Flow');

    it('should complete signup → login → profile update → logout flow', async () => {
      const testUser = f.createUserCredentials('lifecycle');

      await userLifecycleFlow
        .step('Signup')
        .spec()
        .post(`${s.baseUrl}/auth/signup`)
        .withBody(testUser)
        .expectStatus(201)
        .stores('userId', 'id');

      await userLifecycleFlow
        .step('Login')
        .spec()
        .post(`${s.baseUrl}/auth/login`)
        .withBody(testUser)
        .expect('successfulAuth', {
          email: testUser.email,
          role: 'USER',
        })
        .stores('sessionCookie', 'res.headers.set-cookie');

      await userLifecycleFlow
        .step('Get User Info')
        .spec()
        .get(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expect('validUserResponse', {
          email: testUser.email,
        });

      const updateData = f.createUpdateScenarios(testUser).emailOnly();
      await userLifecycleFlow
        .step('Update Profile')
        .spec()
        .put(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .withBody(updateData)
        .expect('validUserResponse', {
          email: updateData.email,
        });

      await userLifecycleFlow
        .step('Verify Profile Update')
        .spec()
        .get(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expectStatus(200)
        .expectBodyContains(updateData.email!);

      await userLifecycleFlow
        .step('Logout')
        .spec()
        .post(`${s.baseUrl}/auth/logout`)
        .withCookies('$S{sessionCookie}')
        .expect('successfulLogout');

      await userLifecycleFlow
        .step('Verify Session Invalidated')
        .spec()
        .get(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expect('authFailure');
    });

    afterAll(async () => {
      await userLifecycleFlow.cleanup();
    });
  });

  describe('Account Deletion Journey', () => {
    const deletionFlow = e2e('Account Deletion Flow');

    it('should complete signup → login → account deletion flow', async () => {
      const testUser = f.createUserCredentials('deletion');

      await deletionFlow
        .step('Create User')
        .spec()
        .post(`${s.baseUrl}/auth/signup`)
        .withBody(testUser)
        .expectStatus(201);

      await deletionFlow
        .step('Login User')
        .spec()
        .post(`${s.baseUrl}/auth/login`)
        .withBody(testUser)
        .expectStatus(200)
        .stores('sessionCookie', 'res.headers.set-cookie');

      await deletionFlow
        .step('Verify Profile Access')
        .spec()
        .get(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expect('validUserResponse');

      const deleteData = f.createValidDeleteData(testUser.password);
      await deletionFlow
        .step('Delete Account')
        .spec()
        .delete(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .withBody(deleteData)
        .expectStatus(204);

      await deletionFlow
        .step('Verify Session Invalidated')
        .spec()
        .get(`${s.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expect('authFailure');

      await deletionFlow
        .step('Verify Cannot Login')
        .spec()
        .post(`${s.baseUrl}/auth/login`)
        .withBody(testUser)
        .expect('authFailure');
    });

    afterAll(async () => {
      await deletionFlow.cleanup();
    });
  });

  describe('Password Change Journey', () => {
    it('should complete password change and re-authentication flow', async () => {
      const { credentials } = await h.createUser('password-change');
      const { sessionKey } = await h.loginUser(credentials);

      // Update password
      const updateData = f.createUpdateScenarios(credentials).passwordOnly();
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/users/me`)
        .withBody(updateData)
        .expectStatus(200);

      // Verify session is still valid after password change
      await a.validateAuthenticatedAccess(sessionKey);

      // Verify can login with new password
      await spec()
        .post(`${s.baseUrl}/auth/login`)
        .withBody({
          email: credentials.email,
          password: updateData.password!,
        })
        .expect('successfulAuth');

      // Verify cannot login with old password
      await spec()
        .post(`${s.baseUrl}/auth/login`)
        .withBody(credentials)
        .expect('authFailure');
    });
  });
});
