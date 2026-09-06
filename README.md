# Household Ledger

A shared budget for two people in one household, built from the design in
[`../../plan/`](../../plan/build-plan.md). Node 20 · Express · MySQL 8 · React · Vite ·
TanStack Query. TypeScript end to end, money as integer minor units everywhere.

## Layout

```
household-ledger/
├─ server/
│  ├─ src/
│  │  ├─ config.ts        env parsed once, at import (the only reader of process.env)
│  │  ├─ money/           §5 arithmetic — pure, no I/O, 100% covered
│  │  ├─ db/              pool, migrate, withHousehold, the scoped repository
│  │  ├─ auth/            argon2id, JWT-in-cookie
│  │  ├─ middleware/      auth, logging (allowlist), errors (one envelope), rate limit
│  │  ├─ routes/          thin — validate, call a service, serialise
│  │  └─ services/        month-view assembly, ordering, period math
│  ├─ migrations/         001_init.sql · 002_seed.sql
│  ├─ scripts/            migrate / seed-users CLI entrypoints
│  └─ test/               unit/ (money) · e2e/ (API integration, flows A–E)
└─ client/
   └─ src/
      ├─ lib/             money.ts (the only ÷100), date.ts (no UTC), api, queries (invalidation map)
      ├─ hooks/           useMonth (month in the URL), useAuth
      ├─ components/      Shell (tabs + FAB), TransactionSheet (Flow B/D), MonthSelector, BudgetBar
      └─ screens/         Login · Summary · Transactions · Budget · Savings · Settings
```

## Running it

```bash
npm install                       # then: npm approve-scripts esbuild argon2   (native builds)

# 1. a MySQL 8 to point at — e.g. Docker:
docker run -d --name hl-mysql -e MYSQL_ROOT_PASSWORD=rootpw \
  -e MYSQL_DATABASE=household_ledger -e MYSQL_USER=hl -e MYSQL_PASSWORD=hlpw \
  -p 3307:3306 mysql:8.0

# 2. environment
cp .env.example .env               # set DATABASE_URL, a 32+ char JWT_SECRET, SEED_A_* / SEED_B_*

# 3. schema + users
npm run migrate
npm run seed:users

# 4a. dev — server (tsx watch) + client (vite) on one origin via proxy
npm run dev                        # client http://localhost:5173  → /api proxied to :3000

# 4b. production shape — one process serves the API and the built client
npm run build && npm start         # http://localhost:3000
```

## The gates (`npm run check`)

`typecheck` · `lint` · `gates` (grep-style structural rules) · `test` (unit) · `test:coverage`
(money module at 100% lines/branches). `npm run e2e` runs the API integration suite
separately because it needs a database.

Structural gates enforced on every run:

- no `pool.query`/`execute` outside `server/src/db/` — tenancy has no DB backstop, so
  `household_id` is a bound parameter no route can reach
- `server/src/money/` imports nothing from `db/`
- `process.env` is read only in `config.ts`
- the client never uses the UTC date serialiser, never `parseFloat`/`* 100` on money,
  and divides by 100 only in `lib/money.ts` / `lib/bar.ts`
- no service worker

## Known deviations from the plan

- **`GET /api/auth/me`** also returns `household.members` (id, name, role). The plan
  scopes `/me` to `{ id, displayName, household: {id,name,currency} }` and never names a
  members endpoint; the paid-by toggle and the read-only member list on Settings both
  need the two names, so they ride on `/me` rather than a new route.
- **PWA icons** are a single `icon.svg` rather than 192/512 PNGs — no binary asset
  pipeline in this build. Swap in real PNGs before store-installability matters.
- **Playwright (Flow A–E in a real browser)** is replaced by the API-level e2e suite
  plus a manual browser pass (see `../TEST-REPORT.md`). The two-month date edit and the
  midnight-boundary period are covered as DB-level assertions instead.
- Deployment: `deploy/README.md` (VPS — systemd + nginx + `deploy.sh`) and
  `deploy/hostinger-shared.md` (Hostinger shared/Premium/Business via the hPanel
  Node.js tool). `tsx` is a runtime dependency so `npm run migrate` / `seed:users`
  work in production without dev dependencies.
