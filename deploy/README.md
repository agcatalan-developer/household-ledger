# Deploying to a Hostinger VPS

One VPS, one Node process, nginx in front, MySQL on localhost. Distilled from
[`../../../plan/deployment.md`](../../../plan/deployment.md) and Phase 14.

```
nginx :443  ──proxy──▶  node :3000  ──▶  MySQL :3306 (localhost)
  TLS, HSTS, redirect     Express API + client/dist from one process
```

---

## 0 · Get the code somewhere the VPS can pull it

`output/household-ledger/` is not a git repo yet. Make it one and push to a
**private** GitHub repo (the deploy script does `git fetch` / `git checkout <tag>`):

```bash
cd output/household-ledger
git init && git add . && git commit -m "Household Ledger v1.0.0"
git tag v1.0.0
git remote add origin git@github.com:you/household-ledger.git
git push -u origin main --tags
```

(No GitHub? `scp -r` the folder to `/srv/household-ledger` and replace the
`git fetch/checkout` lines in `deploy.sh` with your copy step.)

---

## 1 · Provision the VPS  (once, as root)

Hostinger VPS → Ubuntu 22.04/24.04.

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx mysql-server certbot python3-certbot-nginx git age

# GATE 1 — the whole schema depends on this. Below 8.0.16 or MariaDB → stop,
# every CHECK constraint is silently ignored (Phase 1 / Phase 14).
mysql -e "SELECT VERSION();"

# non-root service user that owns nothing but the app dir
adduser --system --group --home /srv/household-ledger ledger
install -d -o ledger -g ledger /srv/household-ledger
```

Database + a least-privilege MySQL user:

```bash
mysql <<'SQL'
CREATE DATABASE household_ledger CHARACTER SET utf8mb4;
CREATE USER 'ledger'@'127.0.0.1' IDENTIFIED BY 'a-strong-db-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON household_ledger.* TO 'ledger'@'127.0.0.1';
GRANT CREATE, ALTER, INDEX, DROP, REFERENCES ON household_ledger.* TO 'ledger'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

---

## 2 · First deploy  (as root, then as `ledger`)

```bash
# as ledger — get the code in place
sudo -u ledger -H bash -c '
  cd /srv/household-ledger &&
  git clone git@github.com:you/household-ledger.git . &&
  git checkout v1.0.0
'

# the environment file — chmod 600, owned by ledger, never in git
sudo -u ledger cp deploy/.env.production.example /srv/household-ledger/.env
sudo -u ledger nano /srv/household-ledger/.env      # real DATABASE_URL, JWT_SECRET, SEED_*
sudo chmod 600 /srv/household-ledger/.env

# build, migrate, seed
sudo -u ledger -H bash -c 'cd /srv/household-ledger && npm ci && npm run build'
sudo -u ledger -H bash -c 'cd /srv/household-ledger && npm run migrate'   # 7 tables, 2 schema_migrations rows
sudo -u ledger -H bash -c 'cd /srv/household-ledger && npm run migrate'   # run again → must be a no-op
sudo -u ledger -H bash -c 'cd /srv/household-ledger && npm run seed:users'

# service
cp deploy/household-ledger.service /etc/systemd/system/
#   ExecStart uses `env node`; if node came from nvm, hard-code its path instead
systemctl daemon-reload
systemctl enable --now household-ledger
curl -fsS http://127.0.0.1:3000/api/health        # {"ok":true}
```

---

## 3 · nginx + TLS

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/household-ledger
#   edit server_name to your domain (point its DNS A record at the VPS first)
ln -s /etc/nginx/sites-available/household-ledger /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d ledger.example.com             # adds ssl_certificate lines + auto-renew
```

Check: `https://` serves the app, `http://` redirects, and the session cookie
carries `Secure` (DevTools → Application → Cookies → `hl_session`). If login
"does nothing", the `X-Forwarded-Proto https` header from nginx is missing.

---

## 4 · Lock it down  (Phase 14)

1. Both people open `https://ledger.example.com`, sign in with the seed
   passwords, and **change their password** in Settings.
2. Remove `SEED_A_*` / `SEED_B_*` from `/srv/household-ledger/.env` —
   two live passwords in a file after one command has used them.
3. `systemctl restart household-ledger`.
4. Tighten the DB grant: `REVOKE CREATE, ALTER, INDEX, DROP, REFERENCES ...`
   (grant them back only for the minute a future `npm run migrate` runs).

---

## 5 · Backups  (Phase 13 — the restore is the deliverable)

```bash
apt-get install -y age
age-keygen -o /root/ledger-backup-key.txt          # keep the private key OFF the VPS too
sudo -u ledger tee /srv/household-ledger/.backup.env >/dev/null <<'ENV'
BACKUP_DB_URL=mysql://ledger:a-strong-db-password@127.0.0.1:3306/household_ledger
BACKUP_AGE_RECIPIENT=age1...                        # the public key from age-keygen
BACKUP_DEST=user@backup-host:/backups/household-ledger
ENV
chmod 600 /srv/household-ledger/.backup.env

cp deploy/household-ledger-backup.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now household-ledger-backup.timer
systemctl start household-ledger-backup.service     # run once now
```

Then **actually restore it once**: decrypt last night's dump into a scratch DB,
compare row counts per table against production, and open the app against it.

---

## 6 · Subsequent deploys

```bash
git tag v1.0.1 && git push --tags                  # on your machine
sudo -u ledger -H /srv/household-ledger/deploy/deploy.sh v1.0.1   # on the VPS
```

`set -euo pipefail` means a failed migration never reaches the restart.
Rollback is `deploy.sh <previous-tag>` — it works because migrations are
**additive only** after launch (add a column/table/index, never rename or drop
in the same deploy as the code that stops using it). Schema rollback does not
exist; a wrong migration is fixed by another migration.

Downtime per deploy is ~1 second.

---

## Health / recovery

| | |
|---|---|
| Logs | `journalctl -u household-ledger -f` (JSON, one line per request, no amounts/emails/tokens) |
| Restart | `systemctl restart household-ledger` |
| Uptime check target | `GET /api/health` — no DB, no cookie |
| Sign everyone out (emergency) | rotate `JWT_SECRET` in `.env`, restart — the only revocation there is |
