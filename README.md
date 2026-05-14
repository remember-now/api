# RememberNow API

NestJS backend for RememberNow - an automatically managed, graph-enabled, time-aware knowledge bank.

## Project setup

Install dependencies:

```bash
npm install
```

Fill out `.env` file (`GEMINI_API_KEY` is required):

```bash
cp .env.example .env
```

Make sure Docker is running:

```bash
docker info
```

## Stack modes

| Command                                        | What runs                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `docker compose up -d`                         | Everything except Langfuse observability                            |
| `docker compose --profile observability up -d` | Everything, including observability                                 |
| `npm run infra:dev:up`                         | Infra + observability (no app container, since dev runs it on host) |
| `npm run infra:test:up`                        | App deps only, no observability                                     |

## Compile and run the project

### Container

Run app in container (easiest):

```bash
docker compose up -d
```

### Dev (host)

Run app on host.

Also brings up Langfuse + MinIO + ClickHouse:

```bash
npx prisma generate && npm run infra:dev:up && npm run prisma:dev:deploy && npm run start:dev
```

When done developing for the day (preserves data):

```bash
npm run infra:dev:stop
```

Resume development with existing data:

```bash
npm run infra:dev:start && npm run start:dev
```

After editing `prisma/schema.prisma` (regenerate client + create a new migration):

```bash
npx prisma generate && npm run prisma:dev:migrate
```

Full reset + infra restart (destroys all data):

```bash
npm run infra:dev:reset
```

Or remove all data manually (would require `infra:dev:up` after):

```bash
npm run infra:dev:rm
```

Once dev infra is up, the following web UIs are available:

- Swagger UI: <http://localhost:3333/api> (requires the app to be running)
- Prisma Studio: <http://localhost:5555> (requires `npm run prisma:studio`)
- Neo4j browser: <http://localhost:7474>
- Langfuse: <http://localhost:3334>
- MinIO console: <http://localhost:9091>

## Development

### Pre-commit hooks

Installed automatically by `npm install` via Husky. On each commit, `lint-staged` runs ESLint (zero warnings allowed) and Prettier across staged TS/JS files, and Prettier across staged JSON/Markdown/YAML.

### Frontend Type Generation

The `openapi.json` is auto-generated when you run `npm run start:dev`.
Make sure to commit changes when you modify routes/DTOs.

### Run tests

Unit tests:

```bash
npm run test
```

E2E tests (`.env.test` file must be present. Change ports to not conflict with dev stack):

```bash
npm run test:e2e
```

Test coverage:

```bash
npm run test:cov
```

### Test stability verification

The anti-flaky test runner executes unit tests once, then runs e2e tests repeatedly to detect intermittent failures and race conditions. Useful for validating test reliability after infrastructure changes.

Run with default 15 iterations:

```bash
./anti-flaky-test.sh
```

Run with custom iteration count:

```bash
./anti-flaky-test.sh 30
```

The runner will exit immediately on first failure and display the failing test output. Test infrastructure is set up once and torn down automatically on completion or interruption.

## Recommended VS Code Extensions

- **Neo4j for VS Code** - Cypher syntax highlighting and linting. Install via VS Code Quick Open (`Ctrl+P`):
  ```
  ext install neo4j-extensions.neo4j-for-vscode
  ```
  All Cypher queries in this codebase are tagged with `/* cypher */` (template literals) or `/*cypher*/` (single-line strings) to enable embedded syntax highlighting directly in TypeScript files.

## Acknowledgements

The knowledge graph pipeline in this project is a modified TypeScript port of [Graphiti](https://github.com/getzep/graphiti) by Zep AI, adapted for this codebase for the following reasons:

- I need to implement a Graph Versioning system to prevent data loss due to agent misbehavior, which is impossible without direct code access.
- Graphiti couples tightly to specific providers. This port integrates with [LangChain](https://js.langchain.com/) so any supported model can be swapped in without changing pipeline code.
- Graphiti maintains provider abstractions for its graph layer. Since Neo4j is a first-class dependency here, those abstractions are unnecessary and removing them adds room for enhancements.
- RememberNow is privacy-focused software. Depending on upstream code that cannot be audited, patched, or controlled introduces risk.

## License

RememberNow is licensed under [Apache-2.0](https://github.com/remember-now/api/blob/main/LICENSE).
