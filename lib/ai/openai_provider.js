import { BaseAIProvider } from "./base-provider.js";

/** OpenAI-compatible chat-completions provider (also used by LM Studio). */
export class OpenAIProvider extends BaseAIProvider {
  constructor(config = {}) { super({ endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", ...config }); }

  async *streamComplete({ prompt, context = "", systemPrompt = "", signal }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: `${context ? `Page context:\n${context}\n\n` : ""}${prompt}` });
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const response = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, signal, body: JSON.stringify({ model: this.config.model, messages, stream: true }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text().catch(() => "")}`);
    yield* readSSE(response, signal, (event) => event.choices?.[0]?.delta?.content || "");
  }

  async testConnection() {
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const headers = this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {};
    const response = await fetch(`${endpoint}/models`, { headers });
    if (!response.ok) throw new Error(`Could not reach OpenAI-compatible endpoint (${response.status})`);
    const data = await response.json();
    return { status: "ok", models: (data.data || []).map((model) => model.id) };
  }
}

export async function* readSSE(response, signal, tokenForEvent) {
  if (!response.body) throw new Error("Streaming response has no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const events = buffer.split("\n\n"); buffer = events.pop() || "";
      for (const event of events) {
        const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") continue;
        try { const token = tokenForEvent(JSON.parse(data)); if (token) yield token; }
        catch (error) { console.warn("[Eevie] Ignoring malformed SSE event", error); }
      }
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    }
  } finally { reader.releaseLock(); }
}
