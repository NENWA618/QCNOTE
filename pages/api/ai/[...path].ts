import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:10000').replace(/\/$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || '';
  const targetUrl = `${BACKEND_URL}/${path}`;

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || typeof value !== 'string') continue;
    if (key.toLowerCase() === 'host') continue;
    headers[key] = value;
  }

  if (!headers['content-type'] && req.body) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD', 'DELETE'].includes(req.method || '') ? undefined : JSON.stringify(req.body),
  });

  const responseText = await response.text();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  res.status(response.status).send(responseText);
}
