// Starts the mockup in server mode:
//   - the backend server (packages/server) on http://localhost:8787, reading/writing data/*.csv
//   - the BlueRiver bank app (apps/demo-bank) on http://localhost:5173, talking to it via /v1
// Ctrl+C stops both.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (label, args, env = {}) => {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  const prefix = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${label}] `);
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => {
    if (code) console.error(`[${label}] exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
};

const children = [
  run('server', ['run', 'dev', '-w', '@familyshield/server']),
  run('bank', ['run', 'dev', '-w', '@familyshield/demo-bank'], { VITE_API_URL: '/v1' }),
];

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
