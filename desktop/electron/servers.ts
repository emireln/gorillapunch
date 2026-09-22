import { Socket } from 'node:net';
import type { LocalServer } from '../shared/types';

const ports = new Map([
  [3000, 'Next.js / React'],
  [3001, 'Node.js'],
  [4173, 'Vite preview'],
  [4200, 'Angular'],
  [5173, 'Vite'],
  [8000, 'Django / FastAPI'],
  [8080, 'Web server'],
  [8888, 'Jupyter / Dev server'],
]);

export async function detectLocalServers(): Promise<LocalServer[]> {
  const checks = [...ports].map(async ([port, service]) => await portOpen(port) ? { port, service, url: `http://localhost:${port}/` } : null);
  return (await Promise.all(checks)).filter((server): server is LocalServer => !!server);
}

function portOpen(port: number) {
  return new Promise<boolean>(resolve => {
    const socket = new Socket();
    let settled = false;
    const done = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(450);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}
