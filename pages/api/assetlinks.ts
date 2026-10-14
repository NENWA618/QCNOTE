import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler, createErrorResponse } from '../../lib/api-utils';
import { buildAssetLinks, parseFingerprints, DEFAULT_TWA_PACKAGE_NAME } from '../../lib/assetLinks';

// 由 next.config.mjs 把 /.well-known/assetlinks.json 改写到这里
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const fingerprints = parseFingerprints(process.env.TWA_SHA256_CERT_FINGERPRINTS);
  if (fingerprints.length === 0) {
    return res.status(404).json(createErrorResponse('Not found', 'NOT_FOUND'));
  }

  const packageName = process.env.TWA_PACKAGE_NAME || DEFAULT_TWA_PACKAGE_NAME;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json(buildAssetLinks(packageName, fingerprints));
}

export default withErrorHandler(handler);
