import type { NextApiRequest, NextApiResponse } from 'next';

const targetOrigin = 'https://live2d.fghrsh.net';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = req.query.path;
  if (!path) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }

  const pathArray = Array.isArray(path) ? path : [path];
  const proxyUrl = `${targetOrigin}/api/${pathArray.join('/')}`;

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.status(204).end();
    return;
  }

  const headers = { ...req.headers };
  delete headers.host;

  try {
    const upstream = await fetch(proxyUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '') ? undefined : req.body,
    });

    const data = await upstream.arrayBuffer();

    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') {
        return;
      }
      res.setHeader(key, value);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(upstream.status).send(Buffer.from(data));
  } catch (error) {
    console.error('Live2D proxy error', error);
    res.status(502).json({ error: 'Proxy failed', details: String(error) });
  }
}
