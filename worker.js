/**
 * Cloudflare Worker — Facebook CAPI Proxy
 *
 * Secrets necessários (configurar via Cloudflare Dashboard ou wrangler):
 *   wrangler secret put FB_PIXEL_ID
 *   wrangler secret put FB_ACCESS_TOKEN
 *
 * O token NUNCA aparece no frontend.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { event_name, event_time, user_data = {}, custom_data = {}, event_source_url } = body;

    if (!event_name) {
      return new Response('Missing event_name', { status: 400 });
    }

    // Build CAPI payload
    const payload = {
      data: [
        {
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          event_source_url: event_source_url || 'https://app.ayunobariatrico.online/',
          action_source: 'website',
          user_data: {
            // Real IP and User-Agent from Cloudflare headers (improves match rate)
            client_ip_address: request.headers.get('CF-Connecting-IP') || '',
            client_user_agent: request.headers.get('User-Agent') || '',
            ...user_data,
          },
          custom_data,
        },
      ],
    };

    const pixelId = env.FB_PIXEL_ID;
    const accessToken = env.FB_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      return new Response('Worker secrets not configured', { status: 500 });
    }

    const fbUrl = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`;

    let fbResult;
    try {
      const fbResp = await fetch(fbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      fbResult = await fbResp.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(fbResult), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
