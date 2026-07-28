export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'esim',
    password: process.env.DB_PASSWORD ?? 'esim',
    name: process.env.DB_NAME ?? 'esim',
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
