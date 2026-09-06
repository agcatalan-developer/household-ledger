import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import './middleware/context.js';
import { requestLogging } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { transactionsRouter } from './routes/transactions.js';
import { summaryRouter } from './routes/summary.js';
import { budgetRouter } from './routes/budget.js';
import { savingsRouter } from './routes/savings.js';
import { categoriesRouter } from './routes/categories.js';
import { householdRouter, profileRouter } from './routes/household.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: false, // nginx owns HSTS in production (deployment.md)
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(requestLogging);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/budget', budgetRouter);
  app.use('/api/savings', savingsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/household', householdRouter);
  app.use('/api/profile', profileRouter);

  app.use('/api', notFoundHandler);

  // The Node process serves the built client from the same origin (Phase 1).
  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
