import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createApiApp } from './server/createApp.ts';
import { runNereusPipeline } from './server/nereusPipeline.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = createApiApp();

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nereus observatory listening on http://0.0.0.0:${PORT}`);
    // Pre-warm real ocean telemetry cache on boot
    runNereusPipeline(false).catch((err) => {
      console.warn('Initial Nereus pre-warm notice:', (err as Error).message);
    });
  });
}

startServer();
