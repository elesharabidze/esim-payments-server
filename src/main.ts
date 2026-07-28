import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

function configure(app: INestApplication) {
  // Only the storefront may call this API from a browser. Reflecting every origin would let
  // any page drive a customer's checkout, and there is no cookie/session for CORS to protect
  // here, so an explicit allowlist costs nothing.
  app.enableCors({ origin: app.get(ConfigService).get<string[]>('corsOrigins') ?? [] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');
}

async function bootstrap() {
  // rawBody: true exposes req.rawBody, needed to verify the E-XEZINE
  // webhook signature, which must be computed over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  configure(app);

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`eSIM backend listening on http://localhost:${port}/api`);
}

let serverPromise: Promise<NodeHandler> | undefined;

// On a serverless host there is no long-lived process to listen on a port: the
// platform imports this module and hands us one request at a time. So we build
// the Nest app over its Express instance and return that instead of listening.
async function createHandler(): Promise<NodeHandler> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configure(app);
  // init() wires up the routes without binding a port, unlike listen().
  await app.init();
  return app.getHttpAdapter().getInstance() as NodeHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Built once and reused, so warm invocations skip the whole Nest bootstrap.
    serverPromise ??= createHandler();
    (await serverPromise)(req, res);
  } catch (error) {
    // A failed bootstrap must not be cached, or it would poison every later
    // request served by this instance.
    serverPromise = undefined;
    throw error;
  }
}

// Only run a standalone server when started directly (`node dist/main`).
// When a serverless host imports this file, the default export above is used.
if (require.main === module) {
  bootstrap();
}
