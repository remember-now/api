# RememberNow API

RememberNow is an automatically managed, graph-enabled, time-aware knowledge bank.

The point is to allow users to dump any amount of information into the app,
and it will embed it into the graph, reminding people of things when necessary
(e.g. appointments).

This is a GraphRAG application, the core of which is in `src/knowledge-graph`.

It is a modified and improved TypeScript port of Graphiti by Zep, which is written in Python originally.

The original Graphiti codebase can be inspected in `REPO_ROOT/graphiti`.

Tech stack:
NestJS 11
Session auth
TypeScript (strict, no `any`)
LangChain + LangGraph
Zod validation
Swagger docs generated automatically using `nestjs-zod`, as all DTOs (in, out) are specified
BullMQ (Redis)
Prisma (PostgreSQL)
Neo4j Community Edition

All environment variables are split by domain and loaded in `src/config`.

Everything is eventually unit tested, and e2e tested. Unit tests are in `src/`, and they
use helpers (e.g. factories) from `src/test`. E2e tests are in `REPO_ROOT/test`

There are pre-commit hooks - `npm run lint` and `npm run format`.

When implementing things, please use context7 as it allows you to fetch all
relevant documentation, and don't forget to lint and format at the end.

Lastly, `tsconfig.json`:

```json
"paths": {
    "@/*": ["./src/*"],
    "@generated/*": ["./generated/*"],
    "@test/*": ["./test/*"]
}
```
