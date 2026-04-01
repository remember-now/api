---
name: debug
description: Debugging knowledge basis for the RememberNow codebase. Invoke when you encounter a non-trivial error during development.
---

Before running `npm run start:dev`, bring up the development infrastructure:

```bash
npm run infra:dev:up
```

After debugging, clean up the infrastructure:

```bash
npm run infra:dev:rm
```

Please note that when running e2e tests, everything is cleaned up automatically,
and runs with different ports due to a separate `.env.test` file.

`package.json`:

```json
"scripts": {
  "prisma:dev:migrate": "dotenv -e .env -- prisma migrate dev",
  "prisma:dev:deploy": "dotenv -e .env -- prisma migrate deploy",
  "prisma:test:deploy": "dotenv -e .env.test -- prisma migrate deploy",
  "infra:dev:up": "docker compose up --wait postgres redis neo4j -d",
  "infra:dev:stop": "docker compose stop postgres redis neo4j",
  "infra:dev:start": "docker compose start postgres redis neo4j",
  "infra:dev:rm": "docker compose down postgres redis neo4j -v",
  "infra:dev:reset": "npm run infra:dev:rm && npm run infra:dev:up && npm run prisma:dev:deploy",
  "infra:test:up": "dotenv -e .env.test -- docker compose -p remember-now-test -f docker-compose.yml -f docker-compose.test.yml up --wait postgres redis neo4j -d",
  "infra:test:stop": "docker compose -p remember-now-test -f docker-compose.yml -f docker-compose.test.yml stop postgres redis neo4j",
  "infra:test:start": "docker compose -p remember-now-test -f docker-compose.yml -f docker-compose.test.yml start postgres redis neo4j",
  "infra:test:rm": "docker compose -p remember-now-test -f docker-compose.yml -f docker-compose.test.yml down postgres redis neo4j -v",
  "infra:test:reset": "npm run infra:test:rm && npm run infra:test:up && npm run prisma:test:deploy",
  "build": "nest build",
  "generate": "nest generate",
  "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
  "start": "nest start",
  "start:dev": "NODE_ENV=dev nest start --watch --exec 'node -r tsconfig-paths/register -r ts-node/register ./src/main.ts'",
  "start:debug": "NODE_ENV=dev nest start --debug --watch --exec 'node -r tsconfig-paths/register -r ts-node/register ./src/main.ts'",
  "start:prod": "NODE_ENV=prod node -r tsconfig-paths/register dist/main",
  "start:migrate:prod": "prisma migrate deploy && npm run start:prod",
  "start:docker": "docker compose up -d",
  "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
  "test:e2e:base": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json --detectOpenHandles",
  "test:e2e": "npm run infra:test:reset && npm run test:e2e:base ; npm run infra:test:rm",
  "test:e2e:watch": "npm run infra:test:reset && npm run test:e2e:base -- --watch --no-cache ; npm run infra:test:rm",
  "test:e2e:auth": "npm run infra:test:reset && npm run test:e2e:base -- --testPathPattern=auth ; npm run infra:test:rm",
  "test:e2e:user": "npm run infra:test:reset && npm run test:e2e:base -- --testPathPattern=user ; npm run infra:test:rm",
  "test:e2e:integration": "npm run infra:test:reset && npm run test:e2e:base -- --testPathPattern=integration ; npm run infra:test:rm",
  "test:e2e:verbose": "npm run infra:test:reset && npm run test:e2e:base -- --verbose ; npm run infra:test:rm",
  "test:e2e:cov": "npm run infra:test:reset && npm run test:e2e:base -- --coverage ; npm run infra:test:rm",
  "prepare": "husky",
  "review": "claude -p '/review'"
},
```
