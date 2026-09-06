-- 001_init.sql — Household Ledger
-- Lives at server/migrations/001_init.sql in the app repo.
-- MySQL 8.0.16+ (below that, CHECK is parsed and silently ignored — see phase-2-database.md)
--
-- DEPLOYMENT NOTE (2026-09-06): the target database is MariaDB 11.8, which rejects
-- DATE_FORMAT() in a GENERATED column (ERROR 1901). Per phase-2-database.md the
-- generated `period` columns use LEFT(txn_date, 7) instead — identical result,
-- obviously deterministic. MariaDB 10.2+ DOES enforce CHECK constraints, so the
-- rest of the schema stands. Verified end to end against mariadb:11.8.

SET NAMES utf8mb4;

-- Infrastructure, not domain. The migration runner owns this table.
CREATE TABLE schema_migrations (
  filename   VARCHAR(255) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filename)
) ENGINE=InnoDB;

CREATE TABLE users (
  id            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(80)  NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)          -- collation is _ai_ci, so uniqueness is case-insensitive
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE households (
  id         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name       VARCHAR(120) NOT NULL,
  currency   CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_households_currency CHECK (currency REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE household_members (
  household_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role         ENUM('owner','member') NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, user_id),
  -- One household per user. Makes auth's user_id -> household_id resolution total
  -- and unambiguous. Drop this the day a second household exists, not before.
  UNIQUE KEY uq_members_user (user_id),
  CONSTRAINT fk_members_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT fk_members_user      FOREIGN KEY (user_id)      REFERENCES users (id)      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id                  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  household_id        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name                VARCHAR(60) NOT NULL,
  type                ENUM('expense','income','savings') NOT NULL,
  target_amount_minor INT UNSIGNED NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  archived_at         DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- These two exist only to be FK parents. Without them the composite FKs below cannot be declared.
  UNIQUE KEY uq_categories_hh_id      (household_id, id),
  UNIQUE KEY uq_categories_hh_id_type (household_id, id, type),
  KEY ix_categories_hh_sort (household_id, sort_order),
  CONSTRAINT fk_categories_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE RESTRICT,
  -- A target belongs to a goal. Only savings categories may carry one.
  CONSTRAINT ck_categories_target CHECK (
    target_amount_minor IS NULL OR (type = 'savings' AND target_amount_minor > 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE budget_lines (
  id            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  household_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category_id   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category_type ENUM('expense','income','savings') NOT NULL,   -- byte-identical to categories.type
  -- Charset deliberately left to the table default, matching transactions.period.
  -- A generated column takes its expression's charset, so forcing ascii here would make
  -- every join or comparison between the two an "illegal mix of collations" error.
  period        CHAR(7) NOT NULL,
  planned_minor INT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Stops "copy last month" run twice from quietly doubling the plan.
  UNIQUE KEY uq_budget_hh_period_category (household_id, period, category_id),
  -- One FK does three jobs: the category exists, it belongs to this household,
  -- and its type matches the denormalised copy the CHECK below narrows.
  CONSTRAINT fk_budget_category FOREIGN KEY (household_id, category_id, category_type)
    REFERENCES categories (household_id, id, type) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_budget_not_income CHECK (category_type <> 'income'),
  CONSTRAINT ck_budget_planned    CHECK (planned_minor > 0),
  CONSTRAINT ck_budget_period     CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transactions (
  id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  household_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount_minor INT UNSIGNED NOT NULL,
  txn_date     DATE NOT NULL,                                  -- client-supplied; no server default
  period       CHAR(7) GENERATED ALWAYS AS (LEFT(txn_date, 7)) STORED,   -- was DATE_FORMAT(txn_date,'%Y-%m'); MariaDB rejects that in a generated column
  note         VARCHAR(255) NULL,
  -- Non-null marks a swept contribution AND records the month it came from.
  -- The UNIQUE below is what makes sweeping August twice impossible.
  swept_from_period CHAR(7) NULL,                                -- same charset as period, for the same reason
  -- Who spent the money. Defaults to the session user, but is editable — one of you
  -- often enters what the other bought. created_by below stays as the audit trail.
  paid_by      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_by   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_txn_swept_from (household_id, swept_from_period),   -- many NULLs are permitted; one non-NULL per month is not
  KEY ix_txn_hh_period          (household_id, period),
  KEY ix_txn_hh_category_period (household_id, category_id, period),
  CONSTRAINT fk_txn_category FOREIGN KEY (household_id, category_id)
    REFERENCES categories (household_id, id) ON DELETE RESTRICT,
  -- These reference household_members, not users: the composite key makes it structurally
  -- impossible to attribute a transaction to someone outside this household.
  CONSTRAINT fk_txn_paid_by    FOREIGN KEY (household_id, paid_by)
    REFERENCES household_members (household_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_txn_created_by FOREIGN KEY (household_id, created_by)
    REFERENCES household_members (household_id, user_id) ON DELETE RESTRICT,
  -- updated_by is nullable; MySQL skips the check when any referencing column is NULL
  CONSTRAINT fk_txn_updated_by FOREIGN KEY (household_id, updated_by)
    REFERENCES household_members (household_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_txn_amount CHECK (amount_minor > 0),
  CONSTRAINT ck_txn_swept_from CHECK (
    swept_from_period IS NULL OR swept_from_period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
