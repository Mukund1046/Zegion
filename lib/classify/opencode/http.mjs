/**
 * Keyed HTTP transport for the OpenCode provider: OpenAI-compatible chat
 * completions against a configured base URL (Zen with OPENCODE_API_KEY,
 * or any OpenAI-compatible endpoint). Paid/keyed access only — the keyless
 * free tier is gated to in-OpenCode clients, use cli.mjs for that.
 */

/**
 * @param {{baseUrl: string, apiKey: string, model: string, prompt: string, timeoutMs?: number}} opts
 * @returns raw assistant text (caller parses)
 */
export async function runHttp({ baseUrl, apiKey, model, prompt, timeoutMs = 180000 }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`classification endpoint unreachable (${err.name === "AbortError" ? "timeout" : err.message})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`classification endpoint HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("classification endpoint returned no content");
  }
  return text.trim();
}
