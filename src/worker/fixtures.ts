import type { Transport } from './network';
// Exact, reserved fixture hostnames. This adapter never opens network connections and is local-only.
export const fixtureUrls = ['https://broken.gp-fixture.example/', 'https://healthy.gp-fixture.example/'] as const;
export function fixtureTransport(input: string): Transport | undefined {
  const origin = new URL(input).origin;
  if (!fixtureUrls.some(url => new URL(url).origin === origin)) return undefined;
  const broken = origin.includes('broken.');
  return async url => {
    const target = new URL(url); if (target.origin !== origin) throw new Error('FIXTURE_BOUNDARY');
    const path = target.pathname;
    let body = '', status = 200, type = 'text/html; charset=utf-8';
    if (path === '/robots.txt') { body = 'User-agent: *\nAllow: /\n'; type = 'text/plain'; }
    else if (path === '/sitemap.xml') { body = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`; type = 'application/xml'; }
    else if (path === '/error.js') { body = 'throw new Error("Fixture: application initialization failed")'; type = 'application/javascript'; }
    else if (path === '/missing') { status = 404; body = '<h1>Not found</h1>'; }
    else if (path === '/favicon.svg') { type = 'image/svg+xml'; body = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff4d20"/></svg>'; }
    else if (path === '/manifest.webmanifest') { type = 'application/manifest+json'; body = JSON.stringify({ name: 'Fixture', short_name: 'Fixture', start_url: '/', display: 'standalone', icons: [] }); }
    else body = broken ? `<!doctype html><html><head><title>Test</title><meta name="robots" content="noindex"><script src="/error.js"></script></head><body style="background:white;color:#222;width:1100px"><h1>Broken fixture</h1><h3>Lorem ipsum</h3><img src="/missing"><form><input type="email"><button>Go</button></form><a href="/missing">Missing page</a></body></html>` : `<!doctype html><html lang="en"><head><title>A healthy application development fixture</title><meta name="description" content="A deterministic local fixture for GorillaPunch checks, with intentional page structure and useful metadata."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${origin}${path}"><link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><meta property="og:title" content="Healthy fixture"><meta property="og:description" content="A development test target"><meta property="og:url" content="${origin}/"><meta property="og:image" content="${origin}/favicon.svg"><meta name="twitter:card" content="summary"></head><body style="margin:32px;font:18px Arial;background:#fff;color:#111"><main><h1>This fixture can take a punch.</h1><p>A real browser inspects this controlled document.</p><a style="display:inline-block;padding:16px" href="/about">About this fixture</a></main></body></html>`;
    return { url: target.href, status, headers: { 'content-type': type, ...(broken ? {} : { 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=()', 'x-frame-options': 'DENY' }) }, body: Buffer.from(body), duration: 1, redirects: [] };
  };
}
