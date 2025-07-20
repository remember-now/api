import { Role } from 'generated/prisma';
import { spec } from 'pactum';
import { TestSetup } from './test-setup';
import { TestHelpers } from './test-helpers';
import { UserResponse } from 'test/types/api-responses';
import { DatabaseUtils } from './database-utils';

/**
 * Helper class for setting up admin users in tests
 * Since there's no API endpoint to create admin users, we need to use direct database access
 */
export class AdminSetup {
  private static prisma = DatabaseUtils.getPrismaClient();

  /**
   * Create an admin user and return their session cookie reference
   * This function first creates a regular user via API, then promotes them to admin via database
   */
  static async createAdminUserAndLogin(userCredentials?: {
    email: string;
    password: string;
  }): Promise<string> {
    const credentials =
      userCredentials || TestHelpers.generateUniqueUser('admin');

    const userId: UserResponse['id'] = await spec()
      .post(`${TestSetup.baseUrl}/auth/signup`)
      .withBody(credentials)
      .expectStatus(201)
      .returns('id');

    await this.promoteUserToAdmin(userId);

    const sessionStoreKey = this.generateSessionKey();
    await spec()
      .post(`${TestSetup.baseUrl}/auth/login`)
      .withBody(credentials)
      .expectStatus(200)
      .stores(sessionStoreKey, 'set-cookie');

    return `$S{${sessionStoreKey}}`;
  }

  /**
   * Promote an existing user to admin role
   */
  static async promoteUserToAdmin(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: Role.ADMIN },
    });
  }

  /**
   * Generate unique session storage key
   */
  private static generateSessionKey(): string {
    return `admin_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
