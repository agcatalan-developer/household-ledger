import { seedUsers } from '../src/db/seed-users.js';
import { pool } from '../src/db/pool.js';

seedUsers(process.env, (m) => console.log(m))
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
