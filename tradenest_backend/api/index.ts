import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import express, { type Request, type Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

let cachedServer: express.Express | undefined;

async function createServer() {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
  });

  configureApp(app);
  await app.init();

  return server;
}

export default async function handler(req: Request, res: Response) {
  cachedServer ??= await createServer();

  return cachedServer(req, res);
}
