import type { APIRoute } from 'astro';
import { headshotUrlFor } from '../../lib/snapshot.ts';

export const prerender = false;

// Same-origin, CDN-cached driver photo: /drivers/<F1 CDN path> (see photoRoute in snapshot.ts).
// F1's CDN answers a missing photo with a generic placeholder image rather than an error, so a
// tiny body means "no photo": answer 404 with a short cache and the page shows initials instead.
const MIN_PHOTO_BYTES = 2048;
const PHOTO_CACHE = 'public, max-age=86400, s-maxage=2592000'; // browsers 1 day, CDN 30 days
const PHOTO_TIMEOUT_MS = 5000;
const MISS_CACHE = 'public, max-age=0, s-maxage=60';

export const GET: APIRoute = async ({ params }) => {
  const miss = () => new Response(null, { status: 404, headers: { 'Cache-Control': MISS_CACHE } });
  const url = headshotUrlFor(params.path ?? '');
  if (!url) return miss();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    if (!res.ok) return miss();
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < MIN_PHOTO_BYTES) return miss();
    return new Response(bytes, {
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'image/png', 'Cache-Control': PHOTO_CACHE },
    });
  } catch {
    return miss();
  }
};
