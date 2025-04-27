<p align="center">
  <a href="https://coveralls.io/github/eduard-cc/flair-api?branch=main" target="_blank">
    <img src="https://coveralls.io/repos/github/eduard-cc/flair-api/badge.svg?branch=main" alt="Coverage Status" />
  </a>
  <a href="https://github.com/eduard-cc/flair-api/actions" target="_blank">
    <img src="https://github.com/eduard-cc/flair-api/actions/workflows/ci.yml/badge.svg" alt="Build Status" />
  </a>
  <a href="https://nodejs.org/" target="_blank">
    <img src="https://img.shields.io/badge/node.js-20.x-brightgreen" alt="Node.js Version" />
  </a>
</p>

## Flair

Flair API is a backend service built with [NestJS](https://nestjs.com) for managing personal finances by allowing users to upload bank statements, view transactions, and categorize spending using AI.

## Prerequisites

Make sure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v20.x)
- [Docker](https://www.docker.com/)

## Installation

```bash
$ npm install
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

Jest is used for end-to-end tests. Before each test file, a new application instance is created, the test database schema is reset (`dropSchema: true`), and the database is seeded with initial data.

```bash
$ npm run test:e2e

# generate coverage report
$ npm run test:e2e:cov
```

This script runs e2e tests sequentially using the test config (`NODE_ENV=test`, loading `.env.test`), running its own Docker test containers.
