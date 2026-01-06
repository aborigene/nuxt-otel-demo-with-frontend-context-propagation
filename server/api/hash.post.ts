import { createHash } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const message = body?.message || '';
  const hash = createHash('sha256').update(message).digest('hex');
  return { hash };
});