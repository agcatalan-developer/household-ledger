# Deploying to Hostinger shared / Premium / Business hosting

No root, no systemd, no nginx. Hostinger runs your Node app under **LiteSpeed +
Passenger** (`lsnode`) and manages TLS for you. The `deploy.sh` / `.service` /
`nginx.conf` files in this folder are for a VPS — ignore them here.

---

## Two things that can stop you cold — check them first

### 1 · The database engine (Gate 1 from the plan)

hPanel → **Databases → phpMyAdmin** → **SQL** tab, run `SELECT VERSION();`.

- **Hostinger currently runs MariaDB 11.8** — this has been tested: the full
  schema applies, every `CHECK` constraint enforces, the generated `period`
  column follows a date edit across a month boundary, and **all 36 API
  integration tests pass against `mariadb:11.8`**. One change was needed and is
  already in `server/migrations/001_init.sql`: MariaDB rejects `DATE_FORMAT()` in
  a generated column (`ERROR 1901`), so `period` is `LEFT(txn_date, 7)` instead
  — identical result, the plan's documented fallback.
- **MySQL ≥ 8.0.16** also fine (the suite runs against `mysql:8.0` too).
- **MySQL 5.7 or MariaDB < 10.2** → **stop.** Every `CHECK` is parsed and
  silently ignored; the schema is the security model. Use a managed platform or
  a small VPS instead.

Run `SELECT VERSION();` anyway to confirm you're on 10.2+ / 8.0.16+.

### 2 · Native modules

`argon2` (password hashing) and `esbuild` (pulled in by `tsx`, used only by the
migrate/seed scripts) are native. On x64 Linux both normally resolve a prebuilt
binary during `npm install`, so this usually just works. If `npm install` on
Hostinger fails building `argon2`, swap it for the prebuilt-only Rust port:

```
npm rm -w server argon2 && npm i -w server @node-rs/argon2
```

then change the three imports (`server/src/auth/passwords.ts`,
`server/src/db/seed-users.ts`, `server/test/e2e/global-setup.ts`) — the API is
`hash(pw)` / `verify(hash, pw)`, near-identical.

---

## Plan: Hostinger **Business** — you have SSH and hPanel Git

That changes the flow: you can build on the server and let hPanel's Git
integration pull each deploy, instead of SFTP-ing `dist/` folders.

## Step by step

### 1 · Create the database (hPanel → Databases → MySQL Databases)

Shared MySQL users can't `CREATE DATABASE` themselves — hPanel provisions it.
Note the three generated values (`u123456_ledger` name / `u123456_ledger` user /
password). Host is `localhost`.

### 2 · Get the code on the server

**Option A — hPanel Git (recommended on Business).** hPanel → **Advanced → GIT**:

- Repository: your private repo URL (add hPanel's deploy SSH key to it, or use an
  HTTPS token)
- Branch: `main`
- Install path: `apps/household-ledger` (outside `public_html`)

It clones on save; a **Deploy** button (and an optional auto-deploy webhook)
pulls later changes.

**Option B — SSH + git by hand.**

```bash
ssh u123456@your-host
mkdir -p ~/apps && cd ~/apps
git clone https://<token>@github.com/you/household-ledger.git
cd household-ledger && git checkout v1.0.0
```

Either way, verify locally first: `npm ci && npm run check` must be green.

### 3 · Build on the server (Business has the resources)

```bash
ssh u123456@your-host
cd ~/apps/household-ledger
npm ci                 # installs everything; esbuild/argon2 resolve prebuilt on linux-x64
npm run build          # server/dist/ + client/dist/
```

If `npm ci` fails compiling `argon2`, do the `@node-rs/argon2` swap above and
re-run. If the build is killed for memory, fall back to building locally and
SFTP-ing `server/dist/` + `client/dist/` (they're gitignored — copy them up
manually).

### 4 · Configure the Node app (hPanel → Advanced → Node.js)

| Field | Value |
|---|---|
| Node version | 20 (or the highest offered) |
| Application root | `apps/household-ledger` |
| Application URL | your domain / subdomain |
| Application startup file | `server/dist/index.js` |

Add **environment variables**:

```
DATABASE_URL = mysql://u123456_ledger:THE_PASSWORD@localhost:3306/u123456_ledger
JWT_SECRET   = <output of: openssl rand -base64 48>      # 32+ chars or the app won't boot
NODE_ENV     = production
SEED_A_EMAIL / SEED_A_PASSWORD / SEED_B_EMAIL / SEED_B_PASSWORD   # temporary
```

(If hPanel already ran `npm ci` in step 3 you can skip its **Run NPM install**.
The app listens on the `PORT` Passenger provides — `server/src/index.ts` already
reads `process.env.PORT`.)

### 5 · Migrate and seed (over SSH)

The env vars you just set live in the Passenger app, not your SSH shell, so pass
them inline (or `source` a local `.env` you keep `chmod 600` in the app dir):

```bash
ssh u123456@your-host
cd ~/apps/household-ledger

export DATABASE_URL='mysql://u123456_ledger:THE_PASSWORD@localhost:3306/u123456_ledger'
export SEED_A_EMAIL=you@example.com   SEED_A_PASSWORD='a-temp-pass'
export SEED_B_EMAIL=them@example.com  SEED_B_PASSWORD='another-temp-pass'

node_modules/.bin/tsx server/scripts/migrate.ts      # 7 tables, 2 schema_migrations rows
node_modules/.bin/tsx server/scripts/migrate.ts      # again → "Nothing to apply"
node_modules/.bin/tsx server/scripts/seed-users.ts   # creates both users + memberships
```

Verify:

```bash
mysql -u u123456_ledger -p u123456_ledger -e \
  'SELECT email, role FROM users JOIN household_members m ON m.user_id = users.id;'
```

### 6 · Restart and check

hPanel Node.js → **Restart**. Visit `https://yourdomain/api/health` → `{"ok":true}`.
Hostinger's free SSL covers `https://`; `helmet` sets the security headers, and
`app.set('trust proxy', 1)` is already in the app so the `Secure` session cookie
works behind LiteSpeed.

### 7 · Lock down (Phase 14)

1. Both people sign in at `https://yourdomain`, change their password in Settings.
2. **Delete `SEED_A_*` / `SEED_B_*`** from the panel's environment variables.
3. Restart.

---

## Deploying an update (Business = SSH + Git)

```bash
# on your machine
git tag v1.0.1 && git push --tags && git push

# on the server (or hPanel GIT → Deploy)
ssh u123456@your-host
cd ~/apps/household-ledger
git fetch --tags && git checkout v1.0.1
npm ci && npm run build
export DATABASE_URL='mysql://…'          # only if there's a new migration
node_modules/.bin/tsx server/scripts/migrate.ts
# then hPanel Node.js → Restart   (or: touch tmp/restart.txt)
```

Migrations are forward-only and must stay **additive** after launch (add a
column/table/index, never rename/drop in the same deploy as the code that stops
using it). Rollback = check out the previous tag + rebuild + restart; old code
ignores a new column.

## Operating it

| | |
|---|---|
| Logs | hPanel Node.js → logs, or `journalctl`-style output in `~/apps/household-ledger` |
| Restart | hPanel Node.js → Restart, or `touch ~/apps/household-ledger/tmp/restart.txt` |
| Backups | Business plan has **daily automatic backups** in hPanel — plus export via phpMyAdmin or `mysqldump` over SSH and keep a copy off Hostinger; do one real restore before you trust it |
| Sign everyone out | change `JWT_SECRET` in the panel, Restart — the only revocation there is |

## What you give up vs. a VPS

- The in-memory login rate limiter resets whenever Passenger idles the app out
  and restarts it. The plan already accepts this ("a restart clears it —
  acceptable").
- No `deploy.sh` one-shot with an automatic health-check gate — it's
  build + migrate + restart, by hand or via hPanel GIT.
- No control over the DB engine — it's MariaDB 11.8 (tested, fine).
