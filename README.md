# eSIM Store - Backend

NestJS + TypeORM + PostgreSQL backend for a demo eSIM storefront, integrated with the
[E-XEZINE PSP Core API](https://docs.e-xezine.az/en/) (a BeGateway-based payment gateway)
for checkout.

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
```

### Why a mock payment provider

This project was built without E-XEZINE sandbox credentials. Rather than leaving the payment
integration untestable, `PaymentProvider` is an interface with two implementations that are
selected purely by config (`PAYMENT_PROVIDER=mock|exezine`, see `.env.example`):

- `ExezineProvider` implements the real integration exactly as documented at
  docs.e-xezine.az: it creates a checkout token via `POST /ctp/api/checkouts` (HTTP Basic auth
  with Shop ID/Secret Key), redirects the customer to the hosted payment page, and verifies
  the webhook's `Content-Signature` header (RSA-SHA256 over the raw request body) using the
  public key from the E-XEZINE backoffice.
- `MockProvider` implements the identical `PaymentProvider` contract but simulates the gateway
  in-process: `createCheckout()` returns a redirect URL into this app's own
  `/mock-checkout/:token` frontend page - a realistic card form where the **card number
  decides the outcome**, mirroring how real PSP test modes work. Submitting the card calls
  back into this same backend to resolve the checkout, exercising the exact same
  order-status/webhook/eSIM-provisioning code path a real payment would.

  Test cards (also served from `GET /api/payments/mock-test-cards`):

  | Card number           | Outcome     | Result                        |
  | --------------------- | ----------- | ----------------------------- |
  | `4242 4242 4242 4242` | successful  | order paid, eSIM provisioned  |
  | `4000 0000 0000 0002` | declined    | order declined, no eSIM       |
  | `4000 0000 0000 9995` | failed      | order failed, no eSIM         |

  The number is Luhn-checked and the expiry validated (a bad/expired card returns `400`, as a
  card-entry error distinct from a decline); any other valid card approves. The submitted card
  is used only to derive the outcome and is never stored - mirroring the PCI rule that card
  data must not touch merchant storage.

Because `OrdersService` only depends on the `PaymentProvider` interface, dropping in real
E-XEZINE credentials (`PAYMENT_PROVIDER=exezine`, `EXEZINE_SHOP_ID`, `EXEZINE_SECRET_KEY`,
`EXEZINE_WEBHOOK_PUBLIC_KEY`) requires no code changes anywhere else in the app.

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
npm test          # unit tests
npm run test:e2e  # e2e test against a real Postgres connection (uses the same DB_* env vars)
```

## API summary

| Method | Path                              | Description                                   |
| ------ | --------------------------------- | ---------------------------------------------- |
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

## Known simplifications (demo project)

- No authentication - checkout is guest/email-based, and `/api/orders?email=` trusts the
  caller's claimed email rather than verifying ownership. A production build would put this
  behind a magic-link or account login.
- `synchronize: true` on TypeORM instead of migrations, for setup simplicity.
- eSIM provisioning is entirely simulated (random ICCID/activation code) - there's no real
  SM-DP+/MNO behind it, since E-XEZINE only handles payment.
- `MockProvider`'s state lives in memory and resets on server restart.
