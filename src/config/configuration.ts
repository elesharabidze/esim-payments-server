// Hosted Postgres providers (Neon, Supabase, Vercel Postgres, Heroku) hand out a
// single connection string rather than five separate settings, so accept either.
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

// Managed Postgres requires TLS; a local docker-compose instance does not serve it.
const sslDefault = databaseUrl ? 'true' : 'false';

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  database: {
    url: databaseUrl,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'esim',
    password: process.env.DB_PASSWORD ?? 'esim',
    name: process.env.DB_NAME ?? 'esim',
    ssl: (process.env.DB_SSL ?? sslDefault) === 'true',
    // Most managed providers front Postgres with a pooler whose certificate does
    // not chain to a root Node trusts. Set to "true" once you supply a CA.
    sslRejectUnauthorized: (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'false') === 'true',
    // Fine for a demo/test project; a real app would use migrations instead.
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
    // Each serverless instance serves one request at a time, so a large pool just
    // burns through the connection limit of the database.
    poolSize: parseInt(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? '1' : '10'), 10),
    // TypeORM's default of 10 retries at 3s each outlives a serverless
    // invocation, so an unreachable database surfaces as an opaque
    // FUNCTION_INVOCATION_FAILED timeout instead of the actual connection error.
    retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS ?? (process.env.VERCEL ? '2' : '10'), 10),
  },
  payments: {
    // Explicit override, otherwise infer from whether E-XEZINE credentials are present.
    provider: process.env.PAYMENT_PROVIDER ?? (process.env.EXEZINE_SHOP_ID ? 'exezine' : 'mock'),
    exezine: {
      shopId: process.env.EXEZINE_SHOP_ID ?? '',
      secretKey: process.env.EXEZINE_SECRET_KEY ?? '',
      checkoutBaseUrl: process.env.EXEZINE_CHECKOUT_BASE_URL ?? 'https://checkout.e-xezine.az',
      webhookPublicKey: process.env.EXEZINE_WEBHOOK_PUBLIC_KEY ?? '',
      testMode: (process.env.EXEZINE_TEST_MODE ?? 'true') === 'true',
    },
  },
});
