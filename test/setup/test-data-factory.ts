export interface ValidationScenario {
  case: string;
  data: Record<string, unknown>;
  expectedField: string;
}

export interface ProfileUpdateData {
  email?: string;
  password?: string;
  currentPassword: string;
}

export interface DeleteAccountData {
  currentPassword: string;
  confirmationText?: string;
}

export class TestDataFactory {
  static readonly EMAIL_PATTERNS = {
    valid: (prefix: string) =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
    withSpaces: (prefix: string) => `  ${prefix}-${Date.now()}@example.com  `,
    uppercase: (prefix: string) =>
      `${prefix.toUpperCase()}-${Date.now()}@EXAMPLE.COM`,
    specialChars: (prefix: string) =>
      `${prefix}+special-${Date.now()}@example.com`,
    invalid: () => `invalid-email-format-${Date.now()}`,
  } as const;

  static readonly PASSWORD_PATTERNS = {
    valid: () => `password-${Date.now()}`,
    short: () => '123',
    complex: () => 'p@ssw0rd!#$%^&*()',
    withSpaces: () => `  password-${Date.now()}  `,
  } as const;

  /**
   * Generate standard user credentials
   */
  static createUserCredentials(prefix = 'test'): {
    email: string;
    password: string;
  } {
    return {
      email: this.EMAIL_PATTERNS.valid(prefix),
      password: this.PASSWORD_PATTERNS.valid(),
    };
  }

  /**
   * Create user scenarios for testing different email formats
   */
  static createUserScenarios() {
    return {
      standard: () => ({
        email: this.EMAIL_PATTERNS.valid('standard'),
        password: this.PASSWORD_PATTERNS.valid(),
      }),

      emailWithSpaces: () => ({
        email: this.EMAIL_PATTERNS.withSpaces('spaces'),
        password: this.PASSWORD_PATTERNS.valid(),
      }),

      uppercaseEmail: () => ({
        email: this.EMAIL_PATTERNS.uppercase('upper'),
        password: this.PASSWORD_PATTERNS.valid(),
      }),

      specialCharEmail: () => ({
        email: this.EMAIL_PATTERNS.specialChars('special'),
        password: this.PASSWORD_PATTERNS.complex(),
      }),
    };
  }

  static createSignupValidationScenarios(): ValidationScenario[] {
    return [
      {
        case: 'short password',
        data: {
          email: this.EMAIL_PATTERNS.valid('short'),
          password: this.PASSWORD_PATTERNS.short(),
        },
        expectedField: 'password',
      },
      ...this.createLoginValidationScenarios(),
    ];
  }

  static createLoginValidationScenarios(): ValidationScenario[] {
    return [
      {
        case: 'missing password',
        data: { email: this.EMAIL_PATTERNS.valid('login') },
        expectedField: 'password',
      },
      {
        case: 'missing email',
        data: { password: this.PASSWORD_PATTERNS.valid() },
        expectedField: 'email',
      },
      {
        case: 'empty email string',
        data: { email: '', password: this.PASSWORD_PATTERNS.valid() },
        expectedField: 'email',
      },
      {
        case: 'empty password string',
        data: { email: this.EMAIL_PATTERNS.valid('empty-pass'), password: '' },
        expectedField: 'password',
      },
      {
        case: 'null email',
        data: { email: null, password: this.PASSWORD_PATTERNS.valid() },
        expectedField: 'email',
      },
      {
        case: 'null password',
        data: { email: this.EMAIL_PATTERNS.valid('null-pass'), password: null },
        expectedField: 'password',
      },
      {
        case: 'whitespace only email',
        data: { email: '   ', password: this.PASSWORD_PATTERNS.valid() },
        expectedField: 'email',
      },
      {
        case: 'whitespace only password',
        data: {
          email: this.EMAIL_PATTERNS.valid('space-pass'),
          password: '   ',
        },
        expectedField: 'password',
      },
      {
        case: 'invalid email format',
        data: {
          email: this.EMAIL_PATTERNS.invalid(),
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with unicode characters',
        data: {
          email: `tëst-üñîcødé-${Date.now()}@éxämplé.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with emoji',
        data: {
          email: `test-${Date.now()}🚀@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with mixed emoji and unicode',
        data: {
          email: `tëst🎉-${Date.now()}@éxämplé🌟.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'extremely long email',
        data: {
          email: `${'a'.repeat(250)}@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with consecutive dots',
        data: {
          email: `test..double.dot.${Date.now()}@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email starting with dot',
        data: {
          email: `.test-${Date.now()}@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email ending with dot',
        data: {
          email: `test-${Date.now()}.@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with special characters in domain',
        data: {
          email: `test-${Date.now()}@ex@mple.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email without @ symbol',
        data: {
          email: `test-${Date.now()}example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with multiple @ symbols',
        data: {
          email: `test@${Date.now()}@example.com`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
      {
        case: 'email with IP address domain',
        data: {
          email: `test-${Date.now()}@192.168.1.1`,
          password: this.PASSWORD_PATTERNS.valid(),
        },
        expectedField: 'email',
      },
    ];
  }

  /**
   * Create profile update scenarios
   */
  static createUpdateScenarios(currentCredentials: {
    email: string;
    password: string;
  }) {
    return {
      emailOnly: (): ProfileUpdateData => ({
        email: this.EMAIL_PATTERNS.valid('updated'),
        currentPassword: currentCredentials.password,
      }),

      passwordOnly: (): ProfileUpdateData => ({
        password: this.PASSWORD_PATTERNS.valid(),
        currentPassword: currentCredentials.password,
      }),

      both: (): ProfileUpdateData => ({
        email: this.EMAIL_PATTERNS.valid('both-updated'),
        password: this.PASSWORD_PATTERNS.valid(),
        currentPassword: currentCredentials.password,
      }),

      trimmedEmail: (): ProfileUpdateData => ({
        email: this.EMAIL_PATTERNS.withSpaces('trimmed'),
        currentPassword: currentCredentials.password,
      }),
    };
  }

  /**
   * Create account deletion scenarios
   */
  static createDeleteScenarios(currentPassword: string): ValidationScenario[] {
    return [
      {
        case: 'wrong confirmation text',
        data: {
          currentPassword,
          confirmationText: 'DELETE ACCOUNT',
        },
        expectedField: 'confirmationText',
      },
      {
        case: 'case-sensitive confirmation text',
        data: {
          currentPassword,
          confirmationText: 'delete my account',
        },
        expectedField: 'confirmationText',
      },
      {
        case: 'missing confirmation text',
        data: { currentPassword },
        expectedField: 'confirmationText',
      },
    ];
  }

  /**
   * Create valid delete account data
   */
  static createValidDeleteData(currentPassword: string): DeleteAccountData {
    return {
      currentPassword,
      confirmationText: 'DELETE MY ACCOUNT',
    };
  }

  /**
   * Create malformed request scenarios
   */
  static createMalformedScenarios() {
    return [
      // JSON Malformation
      {
        case: 'invalid JSON',
        body: 'invalid-json',
        contentType: 'application/json',
      },
      {
        case: 'truncated JSON',
        body: '{"email": "test@example.com", "password": "pass',
        contentType: 'application/json',
      },
      {
        case: 'malformed JSON with extra comma',
        body: '{"email": "test@example.com",, "password": "password123"}',
        contentType: 'application/json',
      },
      {
        case: 'malformed JSON with missing quotes',
        body: '{email: "test@example.com", password: "password123"}',
        contentType: 'application/json',
      },
      {
        case: 'JSON with control characters',
        body: '{"email": "test\u0000@example.com", "password": "pass\u0001word"}',
        contentType: 'application/json',
      },

      // Content-Type Issues
      {
        case: 'missing content-type header',
        body: '{"email": "test@example.com", "password": "password123"}',
        contentType: null,
      },
      {
        case: 'wrong content-type (text/plain)',
        body: '{"email": "test@example.com", "password": "password123"}',
        contentType: 'text/plain',
      },
      {
        case: 'wrong content-type (xml)',
        body: '{"email": "test@example.com", "password": "password123"}',
        contentType: 'application/xml',
      },
      {
        case: 'malformed content-type header',
        body: '{"email": "test@example.com", "password": "password123"}',
        contentType: 'application/json;;charset=utf-8',
      },

      // Encoding Issues
      {
        case: 'invalid UTF-8 sequences',
        body: Buffer.from([0xff, 0xfe, 0x7b, 0x22]), // Invalid UTF-8 bytes
        contentType: 'application/json',
      },
      {
        case: 'mixed encoding characters',
        body: '{"email": "tëst@éxämplé.com", "password": "pässwørd123"}',
        contentType: 'application/json; charset=iso-8859-1',
      },

      // Size Extremes
      {
        case: 'empty body with JSON content-type',
        body: '',
        contentType: 'application/json',
      },
      {
        case: 'only whitespace body',
        body: '   \n\t  ',
        contentType: 'application/json',
      },
      {
        case: 'extremely large payload',
        body:
          '{"email": "test@example.com", "password": "' +
          'a'.repeat(10000000) +
          '"}',
        contentType: 'application/json',
      },
      {
        case: 'deeply nested JSON',
        body:
          '{"a":'.repeat(1000) +
          '{"email":"test@example.com","password":"pass"}' +
          '}'.repeat(1000),
        contentType: 'application/json',
      },

      // Special Characters & Injection Attempts
      {
        case: 'SQL injection in JSON',
        body: '{"email": "test@example.com\'; DROP TABLE users; --", "password": "password123"}',
        contentType: 'application/json',
      },
      {
        case: 'XSS attempt in JSON',
        body: '{"email": "<script>alert(\\"xss\\")</script>@example.com", "password": "password123"}',
        contentType: 'application/json',
      },
      {
        case: 'NoSQL injection attempt',
        body: '{"email": {"$ne": null}, "password": {"$regex": ".*"}}',
        contentType: 'application/json',
      },
      {
        case: 'null bytes in strings',
        body: '{"email": "test\\u0000@example.com", "password": "pass\\u0000word"}',
        contentType: 'application/json',
      },

      // Data Type Confusion
      {
        case: 'numbers as strings for required fields',
        body: '{"email": 12345, "password": 67890}',
        contentType: 'application/json',
      },
      {
        case: 'arrays instead of strings',
        body: '{"email": ["test@example.com"], "password": ["password123"]}',
        contentType: 'application/json',
      },
      {
        case: 'objects instead of strings',
        body: '{"email": {"value": "test@example.com"}, "password": {"value": "password123"}}',
        contentType: 'application/json',
      },
      {
        case: 'boolean values for string fields',
        body: '{"email": true, "password": false}',
        contentType: 'application/json',
      },
      {
        case: 'null values for required fields',
        body: '{"email": null, "password": null}',
        contentType: 'application/json',
      },

      // Unusual but Valid JSON
      {
        case: 'valid JSON but not object (array)',
        body: '["test@example.com", "password123"]',
        contentType: 'application/json',
      },
      {
        case: 'valid JSON but not object (string)',
        body: '"not an object"',
        contentType: 'application/json',
      },
      {
        case: 'valid JSON but not object (number)',
        body: '42',
        contentType: 'application/json',
      },

      // URL Encoding in JSON Context
      {
        case: 'URL encoded data with JSON content-type',
        body: 'email=test%40example.com&password=password123',
        contentType: 'application/json',
      },
      {
        case: 'form data with JSON content-type',
        body: '------WebKitFormBoundary\r\nContent-Disposition: form-data; name="email"\r\n\r\ntest@example.com\r\n------WebKitFormBoundary--',
        contentType: 'application/json',
      },
    ];
  }
}
