import { spec, e2e } from 'pactum';
import { TestSetup } from '../setup/test-setup';
import { TestHelpers } from '../setup/test-helpers';

describe('Integration (e2e)', () => {
  describe('Complete User Lifecycle', () => {
    const userLifecycleFlow = e2e('User Lifecycle Flow');

    it('should complete signup -> login -> profile update -> logout flow', async () => {
      const testUser = TestHelpers.generateUniqueUser('lifecycle');

      // Step 1: Signup
      await userLifecycleFlow
        .step('Signup')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody(testUser)
        .expectStatus(201)
        .stores('userId', 'id');

      // Step 2: Login
      await userLifecycleFlow
        .step('Login')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withBody(testUser)
        .expectStatus(200)
        .stores('sessionCookie', 'res.headers.set-cookie');

      // Step 3: Get user info
      await userLifecycleFlow
        .step('Get User Info')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expectStatus(200)
        .expectBodyContains(testUser.email);

      // Step 4: Update profile
      const updatedEmail =
        TestHelpers.generateUniqueUser('updated-lifecycle').email;
      await userLifecycleFlow
        .step('Update Profile')
        .spec()
        .put(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .withBody({
          email: updatedEmail,
          currentPassword: testUser.password,
        })
        .expectStatus(200)
        .expectBodyContains(updatedEmail);

      // Step 5: Verify profile update persists
      await userLifecycleFlow
        .step('Verify Profile Update')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expectStatus(200)
        .expectBodyContains(updatedEmail);

      // Step 6: Logout
      await userLifecycleFlow
        .step('Logout')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/logout`)
        .withCookies('$S{sessionCookie}')
        .expectStatus(200);

      // Step 7: Verify session invalidated
      await userLifecycleFlow
        .step('Verify Session Invalidated')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{sessionCookie}')
        .expectStatus(403);
    });

    afterAll(async () => {
      await userLifecycleFlow.cleanup();
    });
  });

  describe('Multi-User Isolation', () => {
    const multiUserFlow = e2e('Multi-User Isolation');

    it('should isolate user sessions and data', async () => {
      const user1Credentials = TestHelpers.generateUniqueUser('multiuser1');
      const user2Credentials = TestHelpers.generateUniqueUser('multiuser2');

      // Step 1: Create both users
      await multiUserFlow
        .step('Create User 1')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody(user1Credentials)
        .expectStatus(201)
        .stores('user1Id', 'id');

      await multiUserFlow
        .step('Create User 2')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody(user2Credentials)
        .expectStatus(201)
        .stores('user2Id', 'id');

      // Step 2: Login both users
      await multiUserFlow
        .step('Login User 1')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withBody(user1Credentials)
        .expectStatus(200)
        .stores('user1SessionCookie', 'res.headers.set-cookie');

      await multiUserFlow
        .step('Login User 2')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withBody(user2Credentials)
        .expectStatus(200)
        .stores('user2SessionCookie', 'res.headers.set-cookie');

      // Step 3: Verify each user can only access their own data
      await multiUserFlow
        .step('User 1 Gets Own Data')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{user1SessionCookie}')
        .expectStatus(200)
        .expectBodyContains(user1Credentials.email)
        .expectJsonMatch({ id: '$S{user1Id}' });

      await multiUserFlow
        .step('User 2 Gets Own Data')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{user2SessionCookie}')
        .expectStatus(200)
        .expectBodyContains(user2Credentials.email)
        .expectJsonMatch({ id: '$S{user2Id}' });

      // Step 4: Verify cross-session protection
      await multiUserFlow
        .step('Verify Session Isolation')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{user1SessionCookie}')
        .expectStatus(200)
        .expectJsonSchema({
          not: {
            properties: {
              email: { enum: [user2Credentials.email] },
            },
          },
        });
    });

    afterAll(async () => {
      await multiUserFlow.cleanup();
    });
  });

  describe('Session Security and Management', () => {
    const sessionSecurityFlow = e2e('Session Security');

    it('should handle concurrent sessions and security scenarios', async () => {
      const testUser = TestHelpers.generateUniqueUser('session-security');

      // Step 1: Create user
      await sessionSecurityFlow
        .step('Create User')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/signup`)
        .withBody(testUser)
        .expectStatus(201);

      // Step 2: Create first session
      await sessionSecurityFlow
        .step('Create First Session')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withBody(testUser)
        .expectStatus(200)
        .stores('firstSession', 'res.headers.set-cookie');

      // Step 3: Create second session (concurrent)
      await sessionSecurityFlow
        .step('Create Second Session')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/login`)
        .withBody(testUser)
        .expectStatus(200)
        .stores('secondSession', 'res.headers.set-cookie');

      // Step 4: Verify both sessions work
      await sessionSecurityFlow
        .step('Verify First Session Works')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{firstSession}')
        .expectStatus(200);

      await sessionSecurityFlow
        .step('Verify Second Session Works')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{secondSession}')
        .expectStatus(200);

      // Step 5: Logout from first session
      await sessionSecurityFlow
        .step('Logout First Session')
        .spec()
        .post(`${TestSetup.baseUrl}/auth/logout`)
        .withCookies('$S{firstSession}')
        .expectStatus(200);

      // Step 6: Verify selective invalidation
      await sessionSecurityFlow
        .step('Verify First Session Invalid')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{firstSession}')
        .expectStatus(403);

      await sessionSecurityFlow
        .step('Verify Second Session Still Valid')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{secondSession}')
        .expectStatus(200);

      // Step 7: Test session persistence across profile updates
      const newEmail = TestHelpers.generateUniqueUser('updated-security').email;
      await sessionSecurityFlow
        .step('Update Profile')
        .spec()
        .put(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{secondSession}')
        .withBody({
          email: newEmail,
          currentPassword: testUser.password,
        })
        .expectStatus(200);

      await sessionSecurityFlow
        .step('Verify Session Persists After Update')
        .spec()
        .get(`${TestSetup.baseUrl}/users/me`)
        .withCookies('$S{secondSession}')
        .expectStatus(200)
        .expectBodyContains(newEmail);
    });

    afterAll(async () => {
      await sessionSecurityFlow.cleanup();
    });
  });

  // TODO: Uncomment when Memory API is implemented
  describe.skip('User Memory Lifecycle', () => {
    const memoryLifecycleFlow = e2e('Memory Lifecycle');

    it('should complete full memory CRUD operations', async () => {
      const { sessionCookieStoreKey } =
        await TestHelpers.createUserWithSession('memory-lifecycle');

      // Step 1: Create memory
      const memoryData = {
        title: 'Lifecycle Memory',
        content: 'This memory will go through full CRUD cycle',
      };

      await memoryLifecycleFlow
        .step('Create Memory')
        .spec()
        .post(`${TestSetup.baseUrl}/memories`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .withBody(memoryData)
        .expectStatus(201)
        .stores('memoryId', 'id');

      // Step 2: Read memory
      await memoryLifecycleFlow
        .step('Read Memory')
        .spec()
        .get(`${TestSetup.baseUrl}/memories/$S{memoryId}`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .expectStatus(200)
        .expectBodyContains(memoryData.title);

      // Step 3: Update memory
      const updatedData = {
        title: 'Updated Lifecycle Memory',
        content: 'This memory has been updated',
      };

      await memoryLifecycleFlow
        .step('Update Memory')
        .spec()
        .put(`${TestSetup.baseUrl}/memories/$S{memoryId}`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .withBody(updatedData)
        .expectStatus(200)
        .expectBodyContains(updatedData.title);

      // Step 4: Verify update
      await memoryLifecycleFlow
        .step('Verify Update')
        .spec()
        .get(`${TestSetup.baseUrl}/memories/$S{memoryId}`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .expectStatus(200)
        .expectBodyContains(updatedData.title)
        .expectBodyContains(updatedData.content);

      // Step 5: Delete memory
      await memoryLifecycleFlow
        .step('Delete Memory')
        .spec()
        .delete(`${TestSetup.baseUrl}/memories/$S{memoryId}`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .expectStatus(204);

      // Step 6: Verify deletion
      await memoryLifecycleFlow
        .step('Verify Deletion')
        .spec()
        .get(`${TestSetup.baseUrl}/memories/$S{memoryId}`)
        .withCookies(`$S{${sessionCookieStoreKey}}`)
        .expectStatus(404);
    });

    afterAll(async () => {
      await memoryLifecycleFlow.cleanup();
    });
  });

  // TODO: Uncomment when Memory API is implemented
  describe.skip('Memory Isolation Between Users', () => {
    const memoryIsolationFlow = e2e('Memory Isolation');

    it('should ensure memory privacy between users', async () => {
      // Create two users
      const user1 =
        await TestHelpers.createUserWithSession('memory-isolation-1');
      const user2 =
        await TestHelpers.createUserWithSession('memory-isolation-2');

      // User 1 creates memories
      const user1Memory = {
        title: 'User 1 Private Memory',
        content: 'This is private to User 1',
      };

      await memoryIsolationFlow
        .step('User 1 Creates Memory')
        .spec()
        .post(`${TestSetup.baseUrl}/memories`)
        .withCookies(`$S{${user1.sessionCookieStoreKey}}`)
        .withBody(user1Memory)
        .expectStatus(201)
        .stores('user1MemoryId', 'id');

      // User 2 creates memories
      const user2Memory = {
        title: 'User 2 Private Memory',
        content: 'This is private to User 2',
      };

      await memoryIsolationFlow
        .step('User 2 Creates Memory')
        .spec()
        .post(`${TestSetup.baseUrl}/memories`)
        .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
        .withBody(user2Memory)
        .expectStatus(201)
        .stores('user2MemoryId', 'id');

      // Verify User 1 can only see their own memories
      await memoryIsolationFlow
        .step('User 1 Gets Own Memories')
        .spec()
        .get(`${TestSetup.baseUrl}/memories`)
        .withCookies(`$S{${user1.sessionCookieStoreKey}}`)
        .expectStatus(200)
        .expectBodyContains(user1Memory.title)
        .expectJsonSchema({
          type: 'array',
          items: {
            properties: {
              userId: { enum: [user1.userId] },
            },
          },
        });

      // Verify User 2 cannot access User 1's memory directly
      await memoryIsolationFlow
        .step('User 2 Cannot Access User 1 Memory')
        .spec()
        .get(`${TestSetup.baseUrl}/memories/$S{user1MemoryId}`)
        .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
        .expectStatus(403);

      // Verify User 1 cannot access User 2's memory directly
      await memoryIsolationFlow
        .step('User 1 Cannot Access User 2 Memory')
        .spec()
        .get(`${TestSetup.baseUrl}/memories/$S{user2MemoryId}`)
        .withCookies(`$S{${user1.sessionCookieStoreKey}}`)
        .expectStatus(403);

      // Verify User 2 cannot modify User 1's memory
      await memoryIsolationFlow
        .step('User 2 Cannot Modify User 1 Memory')
        .spec()
        .put(`${TestSetup.baseUrl}/memories/$S{user1MemoryId}`)
        .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
        .withBody({ title: 'Hacked Title' })
        .expectStatus(403);

      // Verify User 2 cannot delete User 1's memory
      await memoryIsolationFlow
        .step('User 2 Cannot Delete User 1 Memory')
        .spec()
        .delete(`${TestSetup.baseUrl}/memories/$S{user1MemoryId}`)
        .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
        .expectStatus(403);
    });

    afterAll(async () => {
      await memoryIsolationFlow.cleanup();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle rapid successive operations gracefully', async () => {
      const { sessionCookieStoreKey } =
        await TestHelpers.createUserWithSession('rapid-operations');

      // Rapid requests should all succeed without conflicts
      const rapidRequests = Array.from({ length: 10 }, (_) =>
        spec()
          .get(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${sessionCookieStoreKey}}`)
          .expectStatus(200)
          .toss(),
      );

      await Promise.all(rapidRequests);
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        // Invalid JSON
        spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody('invalid-json')
          .expectStatus(400)
          .toss(),

        // Wrong content type
        spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withHeaders('Content-Type', 'text/plain')
          .withBody(
            JSON.stringify({ email: 'test@example.com', password: 'password' }),
          )
          .expectStatus(400)
          .toss(),

        // Missing required fields
        spec()
          .post(`${TestSetup.baseUrl}/auth/signup`)
          .withBody({})
          .expectStatus(400)
          .toss(),
      ];

      await Promise.all(malformedRequests);
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const user1 = await TestHelpers.createUserWithSession('concurrent-1');
      const user2 = await TestHelpers.createUserWithSession('concurrent-2');

      // Concurrent profile updates should not interfere with each other
      const concurrentUpdates = [
        spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${user1.sessionCookieStoreKey}}`)
          .withBody({
            email: TestHelpers.generateUniqueUser('concurrent-update-1').email,
            currentPassword: user1.credentials.password,
          })
          .expectStatus(200)
          .toss(),

        spec()
          .put(`${TestSetup.baseUrl}/users/me`)
          .withCookies(`$S{${user2.sessionCookieStoreKey}}`)
          .withBody({
            email: TestHelpers.generateUniqueUser('concurrent-update-2').email,
            currentPassword: user2.credentials.password,
          })
          .expectStatus(200)
          .toss(),
      ];

      await Promise.all(concurrentUpdates);

      // Verify both users still have valid sessions
      await TestHelpers.validateAuthenticatedAccess(
        user1.sessionCookieStoreKey,
      );
      await TestHelpers.validateAuthenticatedAccess(
        user2.sessionCookieStoreKey,
      );
    });
  });
});
