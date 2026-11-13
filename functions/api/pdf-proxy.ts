import { CORS_HEADERS, jsonResponse, type Env } from '../types';

const ALLOWED_HOST_PATTERN =
  /^(?:[a-z0-9-]+\.)*(?:scielo\.(?:org|br|cl|pt|edu\.uy|sa\.cr|sld\.cu|isciii\.es)|scielo\.org\.(?:ar|bo|co|ec|mx|pe|py|ve)|scielo\.iics\.una\.py|doabooks\.org|oapen\.org)$/i;

const PRIVATE_IP_OR_LOCAL = /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\]|0\.0\.0\.0)/i;

const MAX_CACHEABLE_BYTES = 25 * 1024 * 1024; // 25 MB safe Worker cache threshold

function normalizeTargetUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (PRIVATE_IP_OR_LOCAL.test(parsed.hostname)) return null;
    if (!ALLOWED_HOST_PATTERN.test(parsed.hostname)) return null;

    // Upgrade known HTTPS SciELO hosts to prevent mixed-content issues
    if (parsed.protocol === 'http:' && parsed.hostname !== 'oai.books.scielo.org') {
      parsed.protocol = 'https:';
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseByteRange(rangeHeader: string, totalLength: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];

  let start = startStr ? Number.parseInt(startStr, 10) : 0;
  let end = endStr ? Number.parseInt(endStr, 10) : totalLength - 1;

  if (!startStr && endStr) {
    // Suffix byte-range: bytes=-500
    const suffixLen = Number.parseInt(endStr, 10);
    start = Math.max(0, totalLength - suffixLen);
    end = totalLength - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= totalLength) {
    return null;
  }
  end = Math.min(end, totalLength - 1);
  return { start, end };
}

function buildProxyHeaders(upstream: Headers, extra: Record<string, string> = {}): Headers {
  const headers = new Headers();
  const contentType = upstream.get('content-type') || 'application/pdf';
  headers.set('Content-Type', contentType);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');

  const passthrough = ['content-length', 'content-range', 'etag', 'last-modified'];
  for (const key of passthrough) {
    const val = upstream.get(key);
    if (val) headers.set(key, val);
  }

  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  // Explicitly omit X-Frame-Options and restrictive CSP so PDF.js & inline previews work
  headers.delete('X-Frame-Options');

  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v);
  }
  return headers;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const reqUrl = new URL(request.url);
  const rawTarget = reqUrl.searchParams.get('url');
  if (!rawTarget) {
    return jsonResponse({ error: 'Missing required ?url= parameter' }, 400);
  }

  const targetUrl = normalizeTargetUrl(rawTarget);
  if (!targetUrl) {
    return jsonResponse(
      {
        error: 'disallowed_origin',
        message: 'Only verified SciELO and Open Access academic domains are permitted.'
      },
      403
    );
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(targetUrl.toString(), { method: 'GET' });
  const rangeHeader = request.headers.get('Range');

  try {
    // 1. Check Cloudflare Edge Cache first (only full 200 entries are stored in Cache API)
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: buildProxyHeaders(cachedResponse.headers, { 'X-Edge-Cache': 'HIT' })
        });
      }

      if (rangeHeader) {
        const totalSizeHeader = cachedResponse.headers.get('content-length');
        const totalSize = totalSizeHeader ? Number.parseInt(totalSizeHeader, 10) : 0;
        if (totalSize > 0 && totalSize <= MAX_CACHEABLE_BYTES) {
          const buf = await cachedResponse.arrayBuffer();
          const parsedRange = parseByteRange(rangeHeader, buf.byteLength);
          if (!parsedRange) {
            return new Response(null, {
              status: 416,
              headers: {
                ...CORS_HEADERS,
                'Content-Range': `bytes */${buf.byteLength}`
              }
            });
          }
          const slice = buf.slice(parsedRange.start, parsedRange.end + 1);
          const headers = buildProxyHeaders(cachedResponse.headers, {
            'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${buf.byteLength}`,
            'Content-Length': String(slice.byteLength),
            'X-Edge-Cache': 'HIT-RANGE'
          });
          return new Response(slice, { status: 206, headers });
        }
      }

      return new Response(cachedResponse.body, {
        status: 200,
        headers: buildProxyHeaders(cachedResponse.headers, { 'X-Edge-Cache': 'HIT' })
      });
    }

    // 2. Cache MISS -> Fetch from upstream SciELO server
    const upstreamHeaders = new Headers({
      'User-Agent': 'SciELO-Open-Library-Edge/1.0 (+https://books.scielo.org)',
      Accept: 'application/pdf,image/*,*/*;q=0.8',
      'Accept-Encoding': 'identity'
    });
    if (rangeHeader && request.method === 'GET') {
      upstreamHeaders.set('Range', rangeHeader);
    }

    const upstreamRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return jsonResponse(
        {
          error: 'upstream_http_error',
          status: upstreamRes.status,
          originalUrl: targetUrl.toString()
        },
        upstreamRes.status >= 500 ? 502 : upstreamRes.status
      );
    }

    const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
    // Guard against anti-bot / Cloudflare HTML interstitial pages masquerading as PDFs
    if (contentType.includes('text/html') && !targetUrl.pathname.endsWith('.html')) {
      return jsonResponse(
        {
          error: 'upstream_html_interstitial',
          message: 'Upstream SciELO portal returned an HTML page or challenge instead of binary PDF.',
          originalUrl: targetUrl.toString()
        },
        502
      );
    }

    const responseHeaders = buildProxyHeaders(upstreamRes.headers, {
      'X-Edge-Cache': upstreamRes.status === 206 ? 'BYPASS-RANGE' : 'MISS'
    });

    // Cloudflare Cache API only accepts status 200 responses (never 206 or HEAD)
    const contentLength = Number.parseInt(upstreamRes.headers.get('content-length') || '0', 10);
    if (
      request.method === 'GET' &&
      upstreamRes.status === 200 &&
      (!contentLength || contentLength <= MAX_CACHEABLE_BYTES)
    ) {
      const [clientStream, cacheStream] = upstreamRes.body
        ? upstreamRes.body.tee()
        : [null, null];

      if (cacheStream) {
        const cacheHeaders = buildProxyHeaders(upstreamRes.headers, {
          'Cache-Control': 'public, max-age=86400'
        });
        const responseToCache = new Response(cacheStream, { status: 200, headers: cacheHeaders });
        context.waitUntil(cache.put(cacheKey, responseToCache).catch(() => undefined));
      }

      return new Response(clientStream, { status: 200, headers: responseHeaders });
    }

    return new Response(request.method === 'HEAD' ? null : upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  } catch (err) {
    return jsonResponse(
      {
        error: 'proxy_fetch_failed',
        message: err instanceof Error ? err.message : 'Unexpected proxy error',
        originalUrl: targetUrl.toString()
      },
      502
    );
  }
};
