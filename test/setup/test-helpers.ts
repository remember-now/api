import { spec } from 'pactum';
import { TestSetup } from './test-setup';
import { UserResponse } from 'test/types/api-responses';

export interface SessionResult {
  userId: number;
  credentials: {
    email: string;
    password: string;
  };
  sessionCookieStoreKey: string;
  userData: UserResponse;
}

export class TestHelpers {
  private static sessionCounter = 0;

  /**
   * Generate unique test data
   */
  static generateUniqueUser(prefix = 'test'): {
    email: string;
    password: string;
  } {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return {
      email: `${prefix}-${timestamp}-${random}@example.com`,
      password: `password-${timestamp}`,
    };
  }

  /**
   * Create and login a user in one step
   * Returns complete user session info
   */
  static async createUserWithSession(
    userPrefix = 'test',
  ): Promise<SessionResult> {
    const userCredentials = this.generateUniqueUser(userPrefix);

    const userId: number = await spec()
      .post(`${TestSetup.baseUrl}/auth/signup`)
      .withBody(userCredentials)
      .expectStatus(201)
      .returns('id');

    const sessionCookieStoreKey = this.generateSessionKey();
    const userData: UserResponse = await spec()
      .post(`${TestSetup.baseUrl}/auth/login`)
      .withBody(userCredentials)
      .expectStatus(200)
      .stores(sessionCookieStoreKey, 'res.headers.set-cookie')
      .returns('user');

    return {
      userId,
      credentials: userCredentials,
      sessionCookieStoreKey,
      userData,
    };
  }

  /**
   * Login existing user and return session info
   */
  static async loginUser(userCredentials: {
    email: string;
    password: string;
  }): Promise<SessionResult> {
    const sessionCookieStoreKey = this.generateSessionKey();
    const userData: UserResponse = await spec()
      .post(`${TestSetup.baseUrl}/auth/login`)
      .withBody(userCredentials)
      .expectStatus(200)
      .stores(sessionCookieStoreKey, 'res.headers.set-cookie')
      .returns('user');

    return {
      userId: userData.id,
      credentials: userCredentials,
      sessionCookieStoreKey,
      userData,
    };
  }

  /**
   * Create user only (no login)
   */
  static async createUser(
    userPrefix = 'test',
  ): Promise<{ id: number; credentials: { email: string; password: string } }> {
    const credentials = this.generateUniqueUser(userPrefix);
    const id: number = await spec()
      .post(`${TestSetup.baseUrl}/auth/signup`)
      .withBody(credentials)
      .expectStatus(201)
      .returns('id');

    return { id, credentials };
  }

  /**
   * Logout user
   */
  static async logoutUser(sessionCookieStoreKey: string): Promise<void> {
    await spec()
      .post(`${TestSetup.baseUrl}/auth/logout`)
      .withCookies(`$S{${sessionCookieStoreKey}}`)
      .expectStatus(200);
  }

  /**
   * Generate unique session storage key
   */
  private static generateSessionKey(): string {
    return `session_${++this.sessionCounter}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Validate authenticated access
   */
  static async validateAuthenticatedAccess(
    sessionCookieStoreKey: string,
  ): Promise<UserResponse> {
    return await spec()
      .get(`${TestSetup.baseUrl}/users/me`)
      .withCookies(`$S{${sessionCookieStoreKey}}`)
      .expectStatus(200)
      .returns('');
  }

  /**
   * Validate unauthenticated rejection
   */
  static async validateUnauthenticatedRejection(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  ): Promise<void> {
    const url = `${TestSetup.baseUrl}${endpoint}`;

    switch (method) {
      case 'GET':
        await spec().get(url).expectStatus(403);
        break;
      case 'POST':
        await spec().post(url).expectStatus(403);
        break;
      case 'PUT':
        await spec().put(url).expectStatus(403);
        break;
      case 'DELETE':
        await spec().delete(url).expectStatus(403);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method as string}`);
    }
  }
}
