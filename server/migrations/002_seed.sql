-- 002_seed.sql — one household and a starter category set.
-- Lives at server/migrations/002_seed.sql in the app repo.
-- No users here. Password hashes are not committed to a repo: users are created by
-- `npm run seed:users`, which reads SEED_A_EMAIL / SEED_A_PASSWORD (and _B_) from the
-- environment, hashes with argon2id in Node, and inserts. See phase-2-database.md.

INSERT INTO households (id, name, currency) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Home', 'PHP');

INSERT INTO categories (id, household_id, name, type, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Groceries',      'expense',  10),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Eating out',     'expense',  20),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Transport',      'expense',  30),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Rent',           'expense',  40),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Utilities',      'expense',  50),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Health',         'expense',  60),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Household',      'expense',  70),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000001', 'Fun',            'expense',  80),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Salary',         'income',  110),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Other income',   'income',  120);

INSERT INTO categories (id, household_id, name, type, target_amount_minor, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'Emergency fund', 'savings', NULL, 210);
