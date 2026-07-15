// Minimal structured logger: timestamped lines to console and to logs/sweep-<date>.log.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

// One log file per UTC day. Date is only read for the filename, never for logic.
const stamp = () => new Date().toISOString();
const logFile = () => path.join(LOG_DIR, `sweep-${stamp().slice(0, 10)}.log`);

function write(level, msg) {
  const line = `${stamp()} [${level}] ${msg}`;
  // eslint-disable-next-line no-console
  console.log(line);
  try {
    fs.appendFileSync(logFile(), line + '\n');
  } catch {
    /* logging must never crash the sweep */
  }
}

export const log = {
  info: (m) => write('INFO', m),
  warn: (m) => write('WARN', m),
  error: (m) => write('ERROR', m),
  flag: (m) => write('FLAG', m), // needs-Matt review items
};
