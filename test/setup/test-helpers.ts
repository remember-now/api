import { spec } from 'pactum';
import { TestSetup } from './test-setup';
import { TestDataFactory } from './test-data-factory';
import { UserResponse } from 'test/types/api-responses';

export interface SessionResult {
  userId: number;
  credentials: {
    email: string;
    password: string;
  };
  sessionKey: string;
  userData: UserResponse;
}

export class TestHelpers {
  private static sessionCounter = 0;

  static generateSessionKey(prefix = 'session'): string {
    return `${prefix}_${++this.sessionCounter}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Create authenticated spec with session cookie
   */
  static authenticatedRequest(sessionKey: string) {
    return spec().withCookies(`$S{${sessionKey}}`);
  }

  /**
   * Create user only (no login)
   */
  static async createUser(
    userPrefix = 'test',
  ): Promise<{ id: number; credentials: { email: string; password: string } }> {
    const credentials = TestDataFactory.createUserCredentials(userPrefix);
    const id: number = await spec()
      .post(`${TestSetup.baseUrl}/auth/signup`)
      .withBody(credentials)
      .expectStatus(201)
      .returns('id');

    return { id, credentials };
  }

  /**
   * Login existing user and return session info
   */
  static async loginUser(userCredentials: {
    email: string;
    password: string;
  }): Promise<SessionResult> {
    const sessionKey = this.generateSessionKey();
    const userData: UserResponse = await spec()
      .post(`${TestSetup.baseUrl}/auth/login`)
      .withBody(userCredentials)
      .expectStatus(200)
      .stores(sessionKey, 'res.headers.set-cookie')
      .returns('user');

    return {
      userId: userData.id,
      credentials: userCredentials,
      sessionKey,
      userData,
    };
  }

  /**
   * Logout user by sessionKey
   */
  static async logoutUser(sessionKey: string): Promise<void> {
    await this.authenticatedRequest(sessionKey)
      .post(`${TestSetup.baseUrl}/auth/logout`)
      .expectStatus(200);
  }

  /**
   * Create and login a user in one step
   */
  static async createUserWithSession(
    userPrefix = 'test',
  ): Promise<SessionResult> {
    const userCredentials = TestDataFactory.createUserCredentials(userPrefix);

    const userId: number = await spec()
      .post(`${TestSetup.baseUrl}/auth/signup`)
      .withBody(userCredentials)
      .expectStatus(201)
      .returns('id');

    const sessionKey = this.generateSessionKey();
    const userData: UserResponse = await spec()
      .post(`${TestSetup.baseUrl}/auth/login`)
      .withBody(userCredentials)
      .expectStatus(200)
      .stores(sessionKey, 'res.headers.set-cookie')
      .returns('user');

    return {
      userId,
      credentials: userCredentials,
      sessionKey,
      userData,
    };
  }
}
