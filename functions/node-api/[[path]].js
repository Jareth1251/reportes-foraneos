// Proxy same-origin /node-api/* -> http://pos.miplayera.com.mx:3001/api/*
// Reproduce en producción (Cloudflare Pages) el proxy que server.proxy de
// Vite solo aplica en `npm run dev`; sin esto, /node-api/* no coincide con
// ninguna ruta del build estático y Pages sirve el index.html del SPA.
const TARGET_ORIGIN = 'http://pos.miplayera.com.mx:3001';

export async function onRequest(context) {
  const { request, params } = context;

  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const incomingUrl = new URL(request.url);
  const targetUrl = `${TARGET_ORIGIN}/api/${path}${incomingUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const init = {
    method: request.method,
    headers,
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.clone().arrayBuffer();
  }

  const response = await fetch(targetUrl, init);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
