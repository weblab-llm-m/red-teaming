interface Env {
  SAKURA_API_KEY: string;
  RATE_LIMIT: KVNamespace;
}

const RATE_LIMITS = {
  minute: { limit: 5, ttl: 60 },
  hour: { limit: 60, ttl: 3600 },
  day: { limit: 200, ttl: 86400 },
};

async function checkRateLimit(
  ip: string,
  kv: KVNamespace,
): Promise<{ allowed: boolean; remaining: Record<string, number> }> {
  const now = Math.floor(Date.now() / 1000);
  const remaining: Record<string, number> = {};

  for (const [period, { limit, ttl }] of Object.entries(RATE_LIMITS)) {
    const windowStart = Math.floor(now / ttl) * ttl;
    const key = `${ip}:${period}:${windowStart}`;
    const countStr = await kv.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    remaining[period] = Math.max(0, limit - count);

    if (count >= limit) {
      return { allowed: false, remaining };
    }
  }

  for (const [period, { ttl }] of Object.entries(RATE_LIMITS)) {
    const windowStart = Math.floor(now / ttl) * ttl;
    const key = `${ip}:${period}:${windowStart}`;
    const countStr = await kv.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    await kv.put(key, String(count + 1), { expirationTtl: ttl });
  }

  return { allowed: true, remaining };
}

const PROVIDERS: Record<string, { baseUrl: string; envKey: keyof Env }> = {
  sakura: {
    baseUrl: "https://api.ai.sakura.ad.jp/v1",
    envKey: "SAKURA_API_KEY",
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const { allowed, remaining } = await checkRateLimit(ip, env.RATE_LIMIT);

        if (!allowed) {
          return new Response(
            JSON.stringify({
              error: "レート制限に達しました。しばらく待ってから再試行してください。",
              remaining,
            }),
            {
              status: 429,
              headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/json",
                "X-RateLimit-Remaining-Minute": String(remaining.minute),
                "X-RateLimit-Remaining-Hour": String(remaining.hour),
                "X-RateLimit-Remaining-Day": String(remaining.day),
              },
            },
          );
        }

        const body = (await request.json()) as {
          provider: string;
          model: string;
          messages: Array<{ role: string; content: string }>;
        };

        const { provider, model, messages } = body;

        if (!provider || !model || !messages) {
          return new Response(JSON.stringify({ error: "provider, model, messages are required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const providerConfig = PROVIDERS[provider];
        if (!providerConfig) {
          return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const apiKey = env[providerConfig.envKey];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: `API key not configured for ${provider}` }), {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages }),
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(null, { status: 404 });
  },
};
