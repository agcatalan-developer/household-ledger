// boot: config → db → routes → listen
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  // Fail fast if the database is unreachable — a restart loop is louder than a
  // server that answers every request with a 500 (deployment.md).
  const conn = await pool.getConnection();
  conn.release();

  const app = createApp();
  app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'listening', port: config.PORT, env: config.NODE_ENV }));
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'boot_failed', error: (err as Error).message }));
  process.exit(1);
});
