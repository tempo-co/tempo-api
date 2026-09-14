<p align="center">
  <a href="https://coveralls.io/github/tempo-co/tempo-api?branch=main" target="_blank">
    <img src="https://coveralls.io/repos/github/tempo-co/tempo-api/badge.svg?branch=main" alt="Coverage Status" />
  </a>
  <a href="https://github.com/tempo-co/tempo-api/actions" target="_blank">
    <img src="https://github.com/tempo-co/tempo-api/actions/workflows/ci.yml/badge.svg" alt="Build Status" />
  </a>
  <a href="https://nodejs.org/" target="_blank">
    <img src="https://img.shields.io/badge/node.js-20.19%2B-brightgreen" alt="Node.js Version" />
  </a>
</p>

## Tempo

Tempo API is a backend service built with [NestJS](https://nestjs.com) for personal finances. It synchronizes real bank data through [Enable Banking](https://enablebanking.com) and serves accounts, balances, and transactions to the [web client](https://github.com/tempo-co/tempo-web).

## Prerequisites

Make sure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v20.19.0+, v22.13.0+, or v24.x+)
- [Docker](https://www.docker.com/)

## Installation

```bash
$ npm ci
```

## Env setup

The development environment uses variables from `.env.development`. To override these locally (for API keys or secrets), define them in a `.env.development.local` file, which takes precedence.

## Development

```bash
$ npm run start:dev
```

This script starts the necessary Docker services, cleans any previous build output and starts the server in watch mode.

### API docs

For development, Swagger UI documentation is enabled. Navigate to http://localhost:3000/docs to interact with the API endpoints.

## Test

### Unit tests

Unit tests use Jest and focus on testing individual components in isolation.

```bash
$ npm run test

# generate coverage report
$ npm run test:cov
```

### E2E tests

Jest is used for end-to-end tests. The shared setup starts a real application and seeds the test accounts. The dedicated categorization profile additionally seeds stable, account-scoped bank connection, account, and transaction fixtures before its test cases run.

```bash
$ npm run test:e2e

# generate coverage report
$ npm run test:e2e:cov

```

The shared E2E setup keeps AI categorization disabled by default. The categorization spec opts into enabled mode before the shared application bootstrap, injects a non-secret placeholder key, and mocks only the provider boundary. It still exercises the real Nest HTTP app, PostgreSQL persistence, BullMQ/Redis queue, worker, response DTOs, and provider-failure handling; the normal E2E cases remain disabled.

### Database seeding

```bash
$ npm run db:seed
```

This truncates and recreates the PostgreSQL `public` schema, then seeds initial data. It runs against whatever database `DB_NAME` points to.
