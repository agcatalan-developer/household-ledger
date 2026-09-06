import type { Ctx } from '../db/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      ctx?: Ctx;
    }
  }
}

export {};
