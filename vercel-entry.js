import { startHttpServer } from './dist/transports/http.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const host = '0.0.0.0';
const memoryDir = '/tmp/.radanmemory';

startHttpServer({ port, host, memoryDir }).then(({ port: actualPort }) => {
  console.log(`radanmemory: Vercel server running on port ${actualPort}`);
}).catch(err => {
  console.error('radanmemory: failed to start server:', err);
  process.exit(1);
});
