// Model / data layer: the only place that talks to the server.

/** GET /providers — provider catalog with live availability. */
export async function fetchProviders() {
  const res = await fetch('/providers');
  if (!res.ok) throw new Error('Failed to load providers (' + res.status + ')');
  return res.json();
}

/**
 * POST /validate — sends the raw editor text (server parses + validates, so
 * JSON syntax errors come back as readable messages).
 */
export async function validate(rawText, { provider, model } = {}) {
  const params = new URLSearchParams();
  if (provider) params.set('provider', provider);
  if (model) params.set('model', model);
  const qs = params.toString();
  const res = await fetch('/validate' + (qs ? '?' + qs : ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawText,
  });
  return res.json();
}
