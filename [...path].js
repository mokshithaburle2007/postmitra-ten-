// Vercel serverless entry: every /api/* request is handled by the same router used locally.
import { createApp } from '../server/index.js';

const { handler } = createApp();
export default handler;
