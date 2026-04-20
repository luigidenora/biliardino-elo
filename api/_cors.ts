import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * CORS middleware for Vercel serverless functions
 * Allows requests from GitHub Pages and local development
 */
export function setCorsHeaders(res: VercelResponse): void {
  const origin = process.env.ACCESS_CONTROL_ALLOW_ORIGIN;
  if (origin) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreFlight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}
