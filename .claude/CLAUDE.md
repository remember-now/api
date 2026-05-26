# RememberNow API

RememberNow is an automatically managed, graph-enabled, time-aware knowledge bank.

The point is to allow users to dump any amount of information into the app,
and it will embed it into the graph, reminding people of things when necessary
(e.g. appointments).

This is a GraphRAG application, the core of which is in `src/knowledge-graph`.

It is a modified and improved TypeScript port of Graphiti by Zep, which is written in Python originally.

The original Graphiti codebase can be inspected in `REPO_ROOT/graphiti`.
`REPO_ROOT` is api (cwd). Please stop checking the directory above `api` - there is
nothing there.

Tech stack:
NestJS 11
Session auth
TypeScript (strict, no `any`)
LangChain + LangGraph
Zod validation
Swagger docs generated automatically using `nestjs-zod`, as all DTOs (in, out) are specified
BullMQ (Redis)
Prisma (PostgreSQL + pgvector + pgvectorscale for ANN search)

All environment variables are split by domain and loaded in `src/config`.

Everything is eventually unit tested, and e2e tested. Unit tests are in `src/`, and they use helpers (e.g. factories) from `src/test`.
E2e tests are in `REPO_ROOT/test`

There are pre-commit hooks - `npm run lint` and `npm run format`.

When implementing things, please use context7 as it allows you to fetch all
relevant documentation, and don't forget to lint and format at the end.

Prefer to use `npm run format:diff` instead of `npm run format` as
it only formats files that were changed in git, and is significantly faster.

Never add "migration code" to make sure the code is compatible with previous
versions of the graph. If something requires a manual migration, tell that
to me explicitly.

Never pipe `npm run lint` into something like `tail` or `grep` because the lint
takes 22 seconds to run, so you're wasting time. The output isn't that big.
Same for `npm test`.

Use `npm run prisma:generate` instead of `npx prisma generate `since it automatically uses dotenv to load the proper .env file when calling prisma. Same for other prisma commands.

Lastly, `tsconfig.json`:

```json
"paths": {
    "@/*": ["./src/*"],
    "@generated/*": ["./generated/*"],
    "@test/*": ["./test/*"]
}
```
