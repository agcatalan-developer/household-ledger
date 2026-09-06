#!/usr/bin/env bash
# deploy/backup.sh — nightly mysqldump, copied OFF the VPS, encrypted.
# A backup on the same disk is a copy, not a backup (Phase 13).
#
# Needs (in the ledger user's environment or a root-only file sourced here):
#   BACKUP_DB_URL   mysql://user:pass@localhost:3306/household_ledger
#   BACKUP_AGE_RECIPIENT   an age public key (age-keygen) — encryption at rest
#   BACKUP_DEST     e.g. user@backup-host:/backups/household-ledger  (scp target)
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# parse mysql://u:p@host:port/db
proto_removed=${BACKUP_DB_URL#mysql://}
creds=${proto_removed%%@*}
hostpart=${proto_removed#*@}
USER=${creds%%:*}; PASS=${creds#*:}
HOSTPORT=${hostpart%%/*}; DB=${hostpart#*/}
HOST=${HOSTPORT%%:*}; PORT=${HOSTPORT#*:}; [ "$PORT" = "$HOST" ] && PORT=3306

DUMP="$WORK/household-ledger-$STAMP.sql"
mysqldump --host="$HOST" --port="$PORT" --user="$USER" --password="$PASS" \
  --single-transaction --routines --triggers --databases "$DB" > "$DUMP"

age -r "$BACKUP_AGE_RECIPIENT" -o "$DUMP.age" "$DUMP"
scp -q "$DUMP.age" "$BACKUP_DEST/"

echo "backed up $DB -> $BACKUP_DEST/$(basename "$DUMP.age")  ($(wc -c < "$DUMP.age") bytes)"

# The deliverable is a completed restore, not this script (Phase 13):
# once, by hand, before launch —
#   age -d -i key.txt household-ledger-*.sql.age | mysql -u root -p
#   compare row counts per table against production
#   open the app against the restored copy
