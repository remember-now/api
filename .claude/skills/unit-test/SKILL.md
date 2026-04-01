---
name: unit-test
description: Testing knowledge base for the RememberNow API. Invoke when writing unit or e2e tests.
---

Please note that you should still read test files when implementing tests.

Please also note that most tests in `src/knowledge-graph` are
ported from Graphiti and not all of them reflect the rigor of the rest of the
codebase.

## Unit Tests (`src/**/*.spec.ts`)

Two patterns depending on complexity:

**Simple services — `useMocker(createMock)` (preferred for most cases):**

```typescript
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';

describe('AuthService', () => {
  let service: AuthService;
  let userService: DeepMocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(AuthService);
    userService = module.get(UserService);
  });

  afterEach(() => jest.clearAllMocks());
});
```

**Complex services with many deps or direct instantiation (e.g. knowledge-graph):**

```typescript
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

describe('UserService', () => {
  let service: UserService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
      ],
    }).compile();

    service = module.get(UserService);
    prisma = module.get(PrismaService) as DeepMockProxy<PrismaService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockReset(prisma);
  });
});
```

**Direct instantiation (for services with many constructor args):**

```typescript
beforeEach(() => {
  mockDep = mockDeep<Dep>();
  service = new MyService(mockDep, mockDeep<Other>());
});
```

**Factories** live in `src/test/factories` — import from `@/test/factories`:

```typescript
import { AuthFactory, UserDtoFactory, UserFactory } from '@/test/factories';

const dto = AuthFactory.createAuthDto();
const user = UserFactory.createUser({ email: 'x@y.com' });
const prismaUser = UserFactory.createPrismaUser({ agentId: 'abc' });
```

- `UserFactory`: `.createUser()`, `.createPrismaUser()`, `.createUserWithoutPassword()`, `.createPrismaUserWithoutPassword()`, `.createUserServiceResult()`, `.createAuthServiceResult()`
- All factories accept partial override objects.
- When adding new factories, use the same static class pattern with a `private static default*` and methods that spread overrides.

**Prisma errors:**

```typescript
import { Prisma } from '@generated/prisma/client';

const e = new Prisma.PrismaClientKnownRequestError('msg', {
  code: 'P2002',
  clientVersion: '5.0.0',
});
// P2002 = unique constraint, P2025 = not found
```

Ensure tests aren't redundant and test specifically enough. For example,
if you are testing whether the API key is encrypted and passed to Prisma in
ciphertext, ensure that you don't just check that the encrypt function is called,
but also that the actual encrypted key is passed to Prisma rather than the
plaintext one.

---

## E2E Tests (`test/**/*.e2e-spec.ts`)

Import from `@test/setup`:

```typescript
import { spec } from 'pactum';

import {
  TestAssertions as a,
  TestDataFactory as f,
  TestHelpers as h,
  TestSetup as s,
} from '@test/setup';
```

**Creating users and sessions:**

```typescript
const { sessionKey } = await h.createUserWithSession('prefix');   // create + login
const { id, credentials } = await h.createUser('prefix');         // create only
const session = await h.loginUser(credentials);                   // login only
const { sessionKey } = await h.createAdminWithSession('prefix');  // admin
await h.logoutUser(sessionKey);
```

**Making requests:**

```typescript
// Unauthenticated
await spec().post(`${s.baseUrl}/auth/signup`).withBody(data).expectStatus(201);

// Authenticated (session cookie injected via pactum store)
await h
  .authenticatedRequest(sessionKey)
  .get(`${s.baseUrl}/users/me`)
  .expectStatus(200);
```

**Custom expect handlers** (defined in `TestAssertions.initializeHandlers()`):

```typescript
.expect('successfulSignup', { email, role: 'USER' })
.expect('successfulAuth', { email, role: 'USER' })
.expect('successfulLogout')
.expect('authFailure')                      // 403
.expect('validationError', 'fieldName')     // 400 with Zod error on field
.expect('validUserResponse')
.expect('validLlmConfigResponse')
.expect('validProvidersList')
```

**Data factory:**

```typescript
f.createUserCredentials('prefix'); // { email, password }
f.createUserScenarios().emailWithSpaces(); // edge case scenarios
f.createSignupValidationScenarios(); // array of { data, expectedField }
f.createLoginValidationScenarios();
f.createUpdateScenarios(credentials);
f.createValidDeleteData(password);
```

**Common assertion helpers:**

```typescript
await a.validateAuthenticatedAccess(sessionKey);
await a.validateUnauthenticatedRejection('/endpoint', 'POST');
```

**pactum `.stores()` / `.returns()`:**

```typescript
.stores(sessionKey, 'res.headers.set-cookie')   // capture session cookie
.returns('user.id')                              // extract from response body
```

**E2E test structure** — each spec file bootstraps nothing; global setup/teardown is in `test/setup/global-setup.ts` / `global-teardown.ts` via `TestSetup.setupApp()` / `teardownApp()`. DB is cleaned before/after each suite automatically.

---

## Running tests

```bash
npm run test              # unit tests only
npm run test:e2e          # infra reset → e2e → infra rm (uses .env.test)
```
