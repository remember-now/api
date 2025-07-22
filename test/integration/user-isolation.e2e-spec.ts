import { TestSetup as s } from '../setup/test-setup';
import { TestHelpers as h } from '../setup/test-helpers';
import { TestDataFactory as f } from '../setup/test-data-factory';

describe('User Isolation Integration (e2e)', () => {
  it('should prevent users from affecting each other during updates', async () => {
    const user1 = await h.createUserWithSession('isolation-update-1');
    const user2 = await h.createUserWithSession('isolation-update-2');

    const user1Update = f.createUpdateScenarios(user1.credentials).emailOnly();
    const user2Update = f.createUpdateScenarios(user2.credentials).both();

    // Execute updates concurrently
    const updatePromises = [
      h
        .authenticatedRequest(user1.sessionKey)
        .put(`${s.baseUrl}/users/me`)
        .withBody(user1Update)
        .expect('validUserResponse', {
          email: user1Update.email,
        }),
      h
        .authenticatedRequest(user2.sessionKey)
        .put(`${s.baseUrl}/users/me`)
        .withBody(user2Update)
        .expect('validUserResponse', {
          email: user2Update.email,
        }),
    ];

    await Promise.all(updatePromises);

    // Verify both users have their correct data concurrently
    const verificationPromises = [
      h
        .authenticatedRequest(user1.sessionKey)
        .get(`${s.baseUrl}/users/me`)
        .expect('validUserResponse', {
          id: user1.userData.id,
          email: user1Update.email,
        }),
      h
        .authenticatedRequest(user2.sessionKey)
        .get(`${s.baseUrl}/users/me`)
        .expect('validUserResponse', {
          id: user2.userData.id,
          email: user2Update.email,
        }),
    ];
    await Promise.all(verificationPromises);
  });

  it('should prevent duplicate emails across users', async () => {
    const user1 = await h.createUserWithSession('unique-1');
    const user2 = await h.createUserWithSession('unique-2');

    // User2 tries to update to User1's email
    await h
      .authenticatedRequest(user2.sessionKey)
      .put(`${s.baseUrl}/users/me`)
      .withBody({
        email: user1.credentials.email,
        currentPassword: user2.credentials.password,
      })
      .expect('authFailure');

    // Verify User2's email remained unchanged
    await h
      .authenticatedRequest(user2.sessionKey)
      .get(`${s.baseUrl}/users/me`)
      .expect('validUserResponse', {
        email: user2.credentials.email,
      });

    // Verify User1's profile is unaffected
    await h
      .authenticatedRequest(user1.sessionKey)
      .get(`${s.baseUrl}/users/me`)
      .expect('validUserResponse', {
        email: user1.credentials.email,
      });
  });

  it('should prevent session data leakage between users', async () => {
    const user1 = await h.createUserWithSession('contamination-1');
    const user2 = await h.createUserWithSession('contamination-2');

    // Perform rapid alternating requests
    const requests = Array.from({ length: 5 }, () => [
      h
        .authenticatedRequest(user1.sessionKey)
        .get(`${s.baseUrl}/users/me`)
        .expect('validUserResponse', { id: user1.userData.id })
        .toss(),
      h
        .authenticatedRequest(user2.sessionKey)
        .get(`${s.baseUrl}/users/me`)
        .expect('validUserResponse', { id: user2.userData.id })
        .toss(),
    ]).flat();

    await Promise.all(requests);
  });

  it('should isolate account deletions between users', async () => {
    const user1 = await h.createUserWithSession('deletion-isolation-1');
    const user2 = await h.createUserWithSession('deletion-isolation-2');

    // User1 deletes their account
    const deleteData = f.createValidDeleteData(user1.credentials.password);
    await h
      .authenticatedRequest(user1.sessionKey)
      .delete(`${s.baseUrl}/users/me`)
      .withBody(deleteData)
      .expectStatus(204);

    // User1's session should be invalidated
    await h
      .authenticatedRequest(user1.sessionKey)
      .get(`${s.baseUrl}/users/me`)
      .expect('authFailure');

    // User2's session should remain valid and unaffected
    await h
      .authenticatedRequest(user2.sessionKey)
      .get(`${s.baseUrl}/users/me`)
      .expect('validUserResponse', {
        id: user2.userData.id,
        email: user2.credentials.email,
      });

    // User2 should still be able to perform operations
    const updateData = f.createUpdateScenarios(user2.credentials).emailOnly();
    await h
      .authenticatedRequest(user2.sessionKey)
      .put(`${s.baseUrl}/users/me`)
      .withBody(updateData)
      .expectStatus(200);
  });
});
