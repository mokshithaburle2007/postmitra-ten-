// Vercel serverless entry: vercel.json rewrites every /api/* request here,
// and the same router used locally handles it (it reads the original req.url).
import { createApp } from '../server/index.js';

const { handler } = createApp();
export default handler;
