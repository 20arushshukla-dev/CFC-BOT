import 'dotenv/config';
import { spawn } from 'node:child_process';

const api = spawn(process.execPath, ['server.js'], { stdio: 'inherit' });
let bot;
let stopping = false;

const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  bot?.kill('SIGTERM');
  process.exitCode = code;
};

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

api.on('error', () => stop(1));

api.on('exit', (code) => {
  if (!stopping) stop(code || 1);
});

const waitForApi = async () => {
  const healthUrl = `http://127.0.0.1:${process.env.PORT || 3001}/api/health`;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
};

waitForApi().then((apiReady) => {
  if (!apiReady || stopping) {
    stop(1);
    return;
  }

  bot = spawn(process.execPath, ['index.js'], { stdio: 'inherit' });
  bot.on('error', () => stop(1));
  bot.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
});