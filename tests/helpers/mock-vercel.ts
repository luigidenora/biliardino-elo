import type { VercelRequest, VercelResponse } from '@vercel/node';

export function mockRequest(overrides: {
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: any;
  query?: Record<string, string>;
  url?: string;
} = {}): VercelRequest {
  return {
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    body: overrides.body ?? undefined,
    query: overrides.query ?? {},
    url: overrides.url ?? '/api/test',
  } as unknown as VercelRequest;
}

export function mockResponse() {
  const res: any = {
    _status: 200,
    _json: null as any,
    _ended: false,
    _headers: {} as Record<string, string>,
    status(code: number) { res._status = code; return res; },
    json(data: any) { res._json = data; res._ended = true; return res; },
    end() { res._ended = true; return res; },
    setHeader(name: string, value: string) { res._headers[name] = value; return res; },
    getHeader(name: string) { return res._headers[name]; },
  };
  return res as typeof res & VercelResponse;
}
