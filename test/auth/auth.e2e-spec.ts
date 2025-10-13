import { spec } from 'pactum';
import {
  TestSetup as s,
  TestHelpers as h,
  TestAssertions as a,
  TestDataFactory as f,
} from 'test/setup';

describe('Auth (e2e)', () => {
  describe('POST /auth/signup', () => {
    describe('Success Cases', () => {
      it('should signup successfully with valid data', async () => {
        const newUser = f.createUserCredentials('signup');

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(newUser)
          .expect('successfulSignup', {
            email: newUser.email,
            role: 'USER',
          });
      });

      it('should trim and lowercase email', async () => {
        const scenario = f.createUserScenarios().emailWithSpaces();
        const expectedEmail = scenario.email.trim().toLowerCase();

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(scenario)
          .expectStatus(201)
          .expectBodyContains(expectedEmail);
      });

      it('should handle uppercase email', async () => {
        const scenario = f.createUserScenarios().uppercaseEmail();
        const expectedEmail = scenario.email.trim().toLowerCase();

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(scenario)
          .expectStatus(201)
          .expectBodyContains(expectedEmail);
      });

      it('should handle special characters in credentials', async () => {
        const specialUser = f.createUserScenarios().specialCharEmail();

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(specialUser)
          .expectStatus(201)
          .expectBodyContains(specialUser.email);
      });
    });

    describe('Validation Errors', () => {
      it('should fail with various signup validation errors', async () => {
        const scenarios = f.createSignupValidationScenarios();

        for (const scenario of scenarios) {
          await spec()
            .post(`${s.baseUrl}/auth/signup`)
            .withBody(scenario.data)
            .expect('validationError', scenario.expectedField);
        }
      });
    });

    describe('Conflict Cases', () => {
      it('should fail with duplicate email', async () => {
        const user = f.createUserCredentials('duplicate');

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(user)
          .expectStatus(201);

        await spec()
          .post(`${s.baseUrl}/auth/signup`)
          .withBody(user)
          .expectStatus(403);
      });
    });
  });

  describe('POST /auth/login', () => {
    describe('Success Cases', () => {
      it('should login successfully with correct credentials', async () => {
        const { credentials } = await h.createUser('login-success');

        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody(credentials)
          .expect('successfulAuth', {
            email: credentials.email,
            role: 'USER',
          });
      });

      it('should handle case-insensitive email login', async () => {
        const { credentials } = await h.createUser('case-insensitive');

        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email.toUpperCase(),
            password: credentials.password,
          })
          .expectStatus(200);
      });

      it('should handle email with spaces during login', async () => {
        const { credentials } = await h.createUser('spaces-login');

        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody({
            email: `  ${credentials.email}  `,
            password: credentials.password,
          })
          .expectStatus(200);
      });
    });

    describe('Authentication Failures', () => {
      it('should fail with invalid password', async () => {
        const { credentials } = await h.createUser('invalid-password');

        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody({
            email: credentials.email,
            password: 'wrongpassword',
          })
          .expect('authFailure');
      });

      it('should fail with non-existent email', async () => {
        const nonExistentUser = f.createUserCredentials('nonexistent');

        await spec()
          .post(`${s.baseUrl}/auth/login`)
          .withBody(nonExistentUser)
          .expect('authFailure');
      });
    });

    describe('Validation Errors', () => {
      it('should fail with various login validation errors', async () => {
        const scenarios = f.createLoginValidationScenarios();

        for (const scenario of scenarios) {
          await spec()
            .post(`${s.baseUrl}/auth/login`)
            .withBody(scenario.data)
            .expectStatus(401);
        }
      });
    });
  });

  describe('POST /auth/logout', () => {
    describe('Success Cases', () => {
      it('should logout successfully when authenticated', async () => {
        const { sessionKey } = await h.createUserWithSession('logout-success');

        await h
          .authenticatedRequest(sessionKey)
          .post(`${s.baseUrl}/auth/logout`)
          .expect('successfulLogout');
      });

      it('should invalidate session after logout', async () => {
        const { sessionKey } =
          await h.createUserWithSession('logout-invalidate');

        await a.validateAuthenticatedAccess(sessionKey);

        await h.logoutUser(sessionKey);

        await h
          .authenticatedRequest(sessionKey)
          .get(`${s.baseUrl}/users/me`)
          .expect('authFailure');
      });
    });

    describe('Authentication Failures', () => {
      it('should fail without authentication', async () => {
        await a.validateUnauthenticatedRejection('/auth/logout', 'POST');
      });

      it('should fail with invalid session cookie', async () => {
        await spec()
          .post(`${s.baseUrl}/auth/logout`)
          .withCookies('invalid-session-cookie')
          .expect('authFailure');
      });
    });
  });
});
