# eSIM Store - Backend

[![CI](https://github.com/elesharabidze/esim-payments-server/actions/workflows/ci.yml/badge.svg)](https://github.com/elesharabidze/esim-payments-server/actions/workflows/ci.yml)

NestJS + TypeORM + PostgreSQL backend for a demo eSIM storefront, integrated with the
[E-XEZINE PSP Core API](https://docs.e-xezine.az/en/) (a BeGateway-based payment gateway)
for checkout.

## A note on E-XEZINE credentials

**This was built without E-XEZINE credentials, because they cannot be obtained by a developer
working alone.** The Shop ID and Secret Key are issued from the
[backoffice](https://docs.e-xezine.az/en/using_api/id_key/) to an onboarded merchant, and
E-XEZINE has no standalone sandbox to sign up for instead - their
[test mode](https://docs.e-xezine.az/en/using_api/testing/) is a `"test": true` flag on
transactions from a shop you already have ("No need to create another shop or account for
tests"). Signing up requires a company and a taxpayer ID.

So the integration is written against the published API and the parts that do not require the
network are tested, rather than left as unexercised code:

- **`ExezineProvider`** is the real integration - `POST /ctp/api/checkouts` with HTTP Basic
  auth, the hosted-payment-page redirect, `GET /ctp/api/checkouts/:token` for authoritative
  status, and RSA-SHA256 verification of the webhook's `Content-Signature` header.
- **`exezine.provider.spec.ts`** pins it down without a gateway: the outgoing request body is
  asserted field by field against the documented shape, every documented status is checked
  through the mapping, and the signature verification is exercised end to end against an RSA
  keypair generated in the test - valid signature accepted, tampered body rejected, wrong key
  rejected, missing header rejected, unconfigured key failing closed.
- **`MockProvider`** implements the same interface so the whole purchase flow is demoable.

What is *not* proven is the wire format against the live gateway: whether E-XEZINE accepts
these exact requests and what its real webhook body looks like. Supplying credentials
(`PAYMENT_PROVIDER=exezine` plus the three `EXEZINE_*` values) switches providers with no code
change anywhere else, which is the point of the interface.

## Stack

- NestJS 10, TypeScript
- PostgreSQL via TypeORM
- E-XEZINE hosted checkout (token-based payment widget flow)

## Architecture

```
src/
  catalog/    Plan entity + read-only catalog API (seeded eSIM data plans)
  orders/     Order entity + lifecycle (pending -> awaiting_payment -> paid/declined/failed)
  esim/       Simulated eSIM provisioning (ICCID, LPA activation code, QR code) once an order is paid
  payments/
    provider/ PaymentProvider interface, with two implementations selected at boot:
                - ExezineProvider: calls the real E-XEZINE PSP Core API
                - MockProvider:    simulates it in-process, no credentials needed
    payments.controller.ts  webhook endpoint + mock-checkout endpoints
    mock-only.guard.ts      404s the mock endpoints unless the mock provider is active
  health/     Liveness probe, including database reachability
  common/     Shared pipes
  config/     Env parsing (configuration.ts) and boot-time validation (env.validation.ts)
```

### The mock payment provider

`PaymentProvider` is an interface with two implementations selected purely by config
(`PAYMENT_PROVIDER=mock|exezine`, see `.env.example`). `MockProvider` simulates the gateway
in-process: `createCheckout()` returns a redirect URL into this app's own
`/mock-checkout/:token` frontend page - a realistic card form where the **card number decides
the outcome**, mirroring how real PSP test modes work. Submitting the card calls back into
this same backend to resolve the checkout, exercising the exact same
order-status/webhook/eSIM-provisioning code path a real payment would.

Test cards (also served from `GET /api/payments/mock-test-cards`):

| Card number           | Outcome    | Result                       |
| --------------------- | ---------- | ---------------------------- |
| `4242 4242 4242 4242` | successful | order paid, eSIM provisioned |
| `4000 0000 0000 0002` | declined   | order declined, no eSIM      |
| `4000 0000 0000 9995` | failed     | order failed, no eSIM        |

The number is Luhn-checked and the expiry validated (a bad/expired card returns `400`, as a
card-entry error distinct from a decline); any other valid card approves. The submitted card is
used only to derive the outcome and is never stored - mirroring the PCI rule that card data must
not touch merchant storage.

A checkout's state lives in the `orders` table rather than in the provider instance: on a
serverless host the process that creates a checkout is rarely the one that later reads it back,
so an in-memory store would lose the token between requests. The order row already carries
everything a checkout needs, and the description and return URL are rebuilt from the same
helpers `OrdersService` used to create them.

The whole `/api/payments/mock/*` surface is guarded by `MockOnlyGuard` and answers `404` unless
the mock provider is the active one - otherwise, with real credentials configured, anyone
holding a payment token could settle an order without paying.

### Webhook handling

E-XEZINE's docs are explicit that a payment should only be considered final once the
`notification_url` webhook arrives, not from the customer's browser redirect alone (the
redirect's `status` query param can be spoofed by a customer with dev tools open, especially
in the public-key widget variant). To stay robust to that, and to any variation in the exact
webhook payload shape:

1. The webhook handler verifies the RSA signature over the raw body.
2. It extracts whatever identifier is present (`tracking_id` or `token`) just to find *which*
   order this is about.
3. It then re-fetches the authoritative status via `GET /ctp/api/checkouts/:token` and applies
   *that* - never the webhook payload's own status field directly.

`POST /api/orders/:id/refresh-status` runs the identical re-fetch-and-apply logic, so the
frontend's `/checkout/return` page can synchronously resolve the order even if the webhook
hasn't arrived yet (common with hosted-checkout redirects racing the webhook).

Because those two paths regularly resolve the same checkout at the same moment,
`applyPaymentStatus()` claims the transition with a conditional `UPDATE ... WHERE status <> ?`
rather than a read-modify-write save. Exactly one caller sees a row affected and goes on to
provision the eSIM; the others just re-read the order. Without that, both would provision and
the second insert would violate the unique constraint on `esims.orderId`.

## Getting started

### 1. Database

```bash
docker compose up -d
```

(Or point `DB_*` env vars at any local Postgres instance.)

### 2. Configure

```bash
cp .env.example .env
```

Defaults run with `PAYMENT_PROVIDER=mock`, so no E-XEZINE credentials are required to try the
full flow. To use real E-XEZINE sandbox credentials instead, set `PAYMENT_PROVIDER=exezine`
and fill in `EXEZINE_SHOP_ID`, `EXEZINE_SECRET_KEY`, and `EXEZINE_WEBHOOK_PUBLIC_KEY`.

### 3. Install, seed, run

```bash
npm install
npm run seed       # loads a starter catalog of eSIM plans
npm run start:dev
```

API is served at `http://localhost:3000/api`.

### 4. Test

```bash
npm test           # 47 unit tests
npm run test:e2e   # 4 e2e tests over HTTP against a real Postgres (same DB_* env vars)
npm run lint:check # eslint without --fix, as CI runs it
```

Both suites plus lint and build run on every push (`.github/workflows/ci.yml`), with the e2e
tests against a Postgres service container rather than a stubbed repository.

Worth knowing what the tests actually cover, given the payment integration cannot reach a live
gateway: `exezine.provider.spec.ts` asserts the outgoing request body field by field against the
documented shape, checks every documented status through the mapping, and verifies the webhook
signature logic against an RSA keypair generated in the test - a tampered body, a signature from
the wrong key, a missing header and an unconfigured public key are each confirmed to be
rejected. The e2e suite drives the whole purchase over HTTP: browse, order, checkout, pay,
eSIM issued, plus the decline and bad-card branches.

## API summary

| Method | Path                              | Description                                   |
| ------ | --------------------------------- | ---------------------------------------------- |
| GET    | `/api/health`                     | Liveness probe; reports database reachability and the active payment provider |
| GET    | `/api/plans`                      | List eSIM plans (`?region=` / `?countryCode=`) |
| GET    | `/api/plans/regions`              | Distinct list of regions                       |
| GET    | `/api/plans/:id`                  | Plan detail                                    |
| POST   | `/api/orders`                     | Create an order (`planId`, `customerEmail`)    |
| GET    | `/api/orders?email=`              | Guest order lookup by email                    |
| GET    | `/api/orders/by-token/:token`     | Look up an order by its payment token (used by the checkout return page) |
| GET    | `/api/orders/:id`                 | Order detail (incl. eSIM once paid)            |
| POST   | `/api/orders/:id/checkout`        | Create a payment checkout, returns `redirectUrl` |
| POST   | `/api/orders/:id/refresh-status`  | Re-sync order status from the payment provider |
| POST   | `/api/payments/webhook`           | E-XEZINE notification endpoint                 |
| GET    | `/api/payments/mock/:token`       | (mock provider only) checkout summary          |
| GET    | `/api/payments/mock-test-cards`   | (mock provider only) list of test cards        |
| POST   | `/api/payments/mock/:token/pay`   | (mock provider only) submit a card, resolves the checkout |

A malformed `:id` answers `404` rather than reaching Postgres, which would reject the uuid
cast with a `500`. The mock endpoints answer `404` unless `PAYMENT_PROVIDER=mock`.

## Deployment

Deployed on Vercel, which detects the NestJS framework and builds `src/main.ts`. That file
exports both a standalone `bootstrap()` for `node dist/main` and a default request handler for
the serverless host, which is built once per instance and reused across warm invocations.

Environment variables to set on the host: `DATABASE_URL` (Neon), `FRONTEND_URL`, `BACKEND_URL`,
and `PAYMENT_PROVIDER`. Everything else has a sensible default - see `.env.example`.

## Known simplifications (demo project)

- No authentication - checkout is guest/email-based, and `/api/orders?email=` trusts the
  caller's claimed email rather than verifying ownership. A production build would put this
  behind a magic-link or account login.
- `synchronize: true` on TypeORM instead of migrations, for setup simplicity. Set
  `DB_SYNCHRONIZE=false` and switch to migrations before a schema anyone depends on.
- eSIM provisioning is entirely simulated (random ICCID/activation code) - there's no real
  SM-DP+/MNO behind it, since E-XEZINE only handles payment.
- In `PAYMENT_PROVIDER=mock` there is no signature to verify, so `POST /api/payments/webhook`
  accepts unsigned calls. It is authenticated only in `exezine` mode.
