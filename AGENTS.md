# Tempo API Agent Instructions

Tempo API is a NestJS backend for personal-finance accounts, bank connections, bank accounts, bank statements, transactions, spending categorization, authentication, and file uploads. It runs on Node.js 22.x and uses PostgreSQL, Redis/BullMQ, Mailpit, and optional Enable Banking and OpenAI-backed integrations.

## Product direction and workflow

- Tempo is personal-use-first, not a public multi-tenant SaaS. A private self-hosted production deployment exists; do not assume managed cloud services or public SaaS behavior.
- The intended deployment model is a self-hosted 24/7 instance using real bank data fetched through Enable Banking, with access from other devices. Keep that separate from local development and test environments.
- Do not push directly to `main`; use a pull request with passing CI. Use Conventional Commit-style messages such as `feat: ...` and `fix: ...`.
- The adjacent frontend repository is `../tempo-web`; in task descriptions, “frontend” means `tempo-web` and “backend” means this `tempo-api`. For cross-repo work, inspect both repositories and their `AGENTS.md` files.
- Pushes to API `main` publish `ghcr.io/tempo-co/tempo-api:latest`, which is consumed by `tempo-web/docker-compose.e2e.yml`; coordinate API contract changes with frontend E2E coverage.

## Dev environment

- Prerequisites: Node.js 22.x and Docker Engine 28.0.0 or later. Install the locked dependencies with `npm ci`.
- Development: `npm run start:dev`. This starts `docker-compose.dev.yml` with `.env.development`, then starts Nest in watch mode. The stack includes PostgreSQL, Redis, RedisInsight, Mailpit, and pgAdmin; published development and test ports bind only to host loopback, and pgAdmin requires login.
- Development Swagger is at `http://localhost:3000/docs` when `PORT=3000`.
- Configuration is validated by `src/app/core/config/config.schema.ts`. `NODE_ENV` selects `.env.development`, `.env.test`, or `.env.production`; the corresponding `.local` file takes precedence for Nest configuration.
- `src/app/core/config/config.schema.ts` is the source of truth for required and optional environment variables. Use `.env.development` plus `.env.development.local` for local secrets, and keep credentials out of Git.
- Optional AI categorization configuration is `AI_CATEGORIZATION_ENABLED` (default `false`), `AI_CATEGORIZATION_PROVIDER` (default `openai`), and `AI_CATEGORIZATION_MODEL` (default `gpt-6-luna`). `OPENAI_API_KEY` is required only when OpenAI categorization is enabled; keep it in the deployment secret/environment path, never in Git.

## Build, lint, format, and test

- Build: `npm run build` (clears `dist`, then runs `nest build`).
- CI-equivalent checks: `npm run lint:check` and `npm run format:check`.
- Auto-fixing variants: `npm run lint` and `npm run format` modify files.
- Unit Jest: `npm run test` or `npm run test:cov`.
- E2E Jest: `npm run test:e2e` or `npm run test:e2e:cov`. These first run `npm run docker:test:down`, then `npm run docker:test:up`, clear `dist`, and run `test/jest-e2e.json` serially with `--runInBand`.
- Direct test-container commands are `npm run docker:test:up` and `npm run docker:test:down`.
- Jest unit tests match `src/**/*.spec.ts`; E2E tests match `test/**/*.e2e.spec.ts`. E2E setup creates the Nest app, applies the global validation pipe, and seeds accounts.
- CI runs `npm ci`, lint/format checks, `npm run build`, `npm run test`, and `npm run test:e2e:cov`; coverage is uploaded to Coveralls.

## Layout and conventions

- `src/main.ts` bootstraps the app; `src/app.module.ts` imports global infrastructure from `src/app/core` and features from `src/app/modules`.
- Core modules cover config, database, email, health, queues, rate limiting, Redis, and sessions. Feature modules include account, auth, bank-account, bank-statement, currency, file, and transaction.
- Feature controllers and most DTOs live under `api/` (or `api/dtos/`); entities and services live at the feature root. Parser, mapper, and categorizer implementations are grouped in nested subdirectories.
- Use the observed aliases `@core/*` and `@modules/*` for cross-feature imports; use relative imports inside a feature. The import sorter groups third-party imports, aliases, then relative imports with blank-line separation.
- TypeScript uses tabs, 4-space tab width, single quotes, trailing commas, LF endings, and a 120-column print width. Prettier also sorts imports and specifiers.
- DTOs use `class-validator`; the app applies `ValidationPipe({whitelist: true, transform: true})`. Entities use TypeORM decorators and `class-transformer` `@Expose`/`@Exclude` for response serialization.
- Services use injected TypeORM repositories and Nest HTTP exceptions (`NotFoundException`, `ConflictException`, `UnauthorizedException`, `BadRequestException`, or `UnprocessableEntityException`) for validated failure paths. Account-owned queries include the account ID.
- BullMQ processors handle background bank-statement and email work. Add or change queue behavior in the relevant `core/queue` constants/module and feature processor/service together.
- For external integrations, prefer E2E/integration coverage against the local Docker services over mocks.

## Pitfalls

- Test mode configures TypeORM with `dropSchema: true`; E2E setup seeds accounts before tests. `.env.test` must satisfy the full config schema and its host ports must be free.
- `npm run test:e2e*` deliberately removes test containers/volumes via `docker compose ... down -v --remove-orphans`. Do not point `.env.test` at a development database.
- `npm run db:seed` truncates and recreates the PostgreSQL `public` schema before seeding; run it only against the intended database.
- Compose uses fixed container names and environment-interpolated host ports, so stale containers or overlapping ports can block startup.
- `dist/` and `coverage/` are generated. Email `.hbs` files belong under `src/app/core/email/templates`; Nest copies them to `dist/src` via `nest-cli.json`.
