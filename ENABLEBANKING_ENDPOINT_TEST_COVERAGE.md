# Enable Banking endpoint E2E coverage

## Scope

- Compared `origin/main...HEAD` on branch `flair-v2-enablebanking`.
- `HEAD` is `3afa990` (`feat: expose banking sync rate limits`).
- “Covered” below means that at least one E2E test sends a request to the exact route.
- This is route-invocation coverage, not complete success/error/authorization branch coverage.
- The current unrelated working-tree change in `tsconfig.json` is not part of this inventory.

## Summary

| Controller file | New routes | Routes invoked by E2E tests | Route-uncovered |
|---|---:|---:|---:|
| `src/app/modules/banking/api/bank-connection.controller.ts` | 5 | 5 | 0 |
| `src/app/modules/banking/api/bank-transaction.controller.ts` | 2 | 2 | 0 |
| **Total** | **7** | **7** | **0** |

All seven newly added routes have at least one E2E request. There are no completely untested new routes.

## Routes by controller file

### `src/app/modules/banking/api/bank-connection.controller.ts`

| Method | Route | Handler | E2E coverage | Representative test locations |
|---|---|---|---|---|
| `POST` | `/bank-connections/authorize` | `startAuthorization` (`:27`) | **Covered** | `test/e2e/banking/bank-connection.e2e.spec.ts:132`, `:144`, `:174`, `:228`, `:272`, `:296`, `:318`, `:360`, `:373` |
| `GET` | `/bank-connections` | `getConnections` (`:34`) | **Covered** | `test/e2e/banking/bank-connection.e2e.spec.ts:209`, `:451`, `:517` |
| `POST` | `/bank-connections/:connectionId/sync` | `synchronize` (`:39`) | **Covered** | `test/e2e/banking/bank-connection.e2e.spec.ts:462`, `:547`, `:594`, `:607`, `:628`, `:651` |
| `GET` | `/bank-connections/callback` | `handleCallback` (`:50`) | **Covered** | `test/e2e/banking/bank-connection.e2e.spec.ts:183`, `:235`, `:264`, `:282`, `:304`, `:342`, `:415` |
| `GET` | `/bank-connections/:connectionId/transactions` | `getTransactions` (`:59`) | **Covered** | `test/e2e/banking/bank-connection.e2e.spec.ts:528`, `:585` |

### `src/app/modules/banking/api/bank-transaction.controller.ts`

| Method | Route | Handler | E2E coverage | Representative test locations |
|---|---|---|---|---|
| `GET` | `/bank-transactions` | `findAll` (`:15`) | **Covered** | `test/e2e/banking/bank-transaction.e2e.spec.ts:202`, `:207`, `:244`, `:258`, `:273`, `:289`, `:295` |
| `GET` | `/bank-transactions/:id` | `findOne` (`:20`) | **Covered** | `test/e2e/banking/bank-transaction.e2e.spec.ts:298`, `:302` |

## Route-level uncovered list

None: **0 of 7** new routes are uncovered by E2E tests.

## Important behavior gaps despite route coverage

These are not uncovered routes, but they are plausible missing E2E cases for the full review:

- `GET /bank-connections`
  - No unauthenticated (`401`) or unverified-account (`403`) assertion.
- `GET /bank-connections/:connectionId/transactions`
  - No unauthenticated or unverified-account assertion.
  - No ownership isolation assertion for another verified account.
  - No non-existent connection or malformed UUID assertion.
- `POST /bank-connections/authorize`
  - No direct missing/invalid-body coverage for required fields.
  - No E2E assertion for its `429` throttle limit.
- `POST /bank-connections/:connectionId/sync`
  - No malformed UUID assertion.
  - No E2E assertion for its `429` throttle limit.
- `GET /bank-connections/callback`
  - Success, cancellation, replay, expired state, provider failure, and rollback paths are covered.
  - Missing or malformed callback-query behavior is not directly covered.
- `GET /bank-transactions`
  - Authentication and verification are covered, as are pagination, sorting, date/account/search filtering, and page-size validation.
  - Validation coverage for invalid sort/filter values and malformed UUIDs inside `filter[externalAccountIds]` is not present.
- `GET /bank-transactions/:id`
  - Owner success and cross-account `404` are covered.
  - No malformed UUID or owner-requested non-existent-ID assertion.

## Bottom line

The added E2E suite reaches every new HTTP route. The next missing-test work is therefore mostly branch coverage—especially authorization/ownership and malformed-identifier cases for the two connection-scoped read routes, plus the newly exposed throttle limits.
