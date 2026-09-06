import { Router } from 'express';
import { z } from 'zod';
import { withHousehold } from '../db/withHousehold.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { Minor, Uuid, assertNoServerOwned } from '../validation.js';
import type { Minor as MinorT } from '../money/index.js';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const categories = await withHousehold(req.ctx!, (r) => r.categories.all());
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

const CreateBody = z
  .object({
    name: z.string().min(1).max(60),
    type: z.enum(['expense', 'income', 'savings']),
    targetAmountMinor: Minor.nullable().optional(),
  })
  .strict();

categoriesRouter.post('/', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const body = CreateBody.parse(req.body);
    if (body.targetAmountMinor != null && body.type !== 'savings') {
      throw new AppError('VALIDATION_FAILED', 'Only savings goals can carry a target');
    }
    const category = await withHousehold(req.ctx!, async (r) => {
      const sortOrder = (await r.categories.maxSortOrder()) + 10;
      const id = await r.categories.insert({
        name: body.name,
        type: body.type,
        targetAmountMinor: (body.targetAmountMinor ?? null) as MinorT | null,
        sortOrder,
      });
      return r.categories.byId(id);
    });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

const PatchBody = z
  .object({
    name: z.string().min(1).max(60).optional(),
    targetAmountMinor: Minor.nullable().optional(),
    archivedAt: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

categoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body, { forbidType: true });
    const id = Uuid.parse(req.params.id);
    const body = PatchBody.parse(req.body);

    const category = await withHousehold(req.ctx!, async (r) => {
      const current = await r.categories.byId(id);
      if (!current) throw new AppError('NOT_FOUND', 'Not found');
      if (body.targetAmountMinor != null && current.type !== 'savings') {
        throw new AppError('VALIDATION_FAILED', 'Only savings goals can carry a target');
      }
      const patch: {
        name?: string;
        targetAmountMinor?: MinorT | null;
        archivedAt?: string | null;
      } = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.targetAmountMinor !== undefined) {
        patch.targetAmountMinor = body.targetAmountMinor as MinorT | null;
      }
      if (body.archivedAt !== undefined) {
        patch.archivedAt = body.archivedAt === null ? null : nowSql();
      }
      await r.categories.update(id, patch);
      return r.categories.byId(id);
    });
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

const OrderBody = z.array(z.object({ id: Uuid, sortOrder: z.number().int() }).strict());

categoriesRouter.put('/order', async (req, res, next) => {
  try {
    const list = OrderBody.parse(req.body);
    await withHousehold(req.ctx!, (r) => r.categories.reorder(list));
    const categories = await withHousehold(req.ctx!, (r) => r.categories.all());
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

function nowSql(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
