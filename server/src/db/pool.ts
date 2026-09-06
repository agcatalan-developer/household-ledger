import mysql from 'mysql2/promise';
import { config } from '../config.js';

// One pool for the process. `namedPlaceholders` off — every query here uses `?`.
// `decimalNumbers` is deliberately NOT set: SUM() still arrives as a string and
// crosses into the money module only through toMinor() at the repository boundary.
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
  multipleStatements: false,
});

export type Pool = typeof pool;
export type PoolConnection = mysql.PoolConnection;
