import { BaseAIProvider } from "./base-provider.js";
import { readSSE } from "./openai_provider.js";

export class AnthropicProvider extends BaseAIProvider {
  constructor(config = {}) { super({ endpoint: "https://api.anthropic.com/v1", model: "claude-3-5-haiku-latest", maxTokens: 2048, ...config }); }

  async *streamComplete({ prompt, context = "", systemPrompt = "", signal }) {
    if (!this.config.apiKey) throw new Error("An Anthropic API key is required.");
    const response = await fetch(`${this.config.endpoint.replace(/\/$/, "")}/messages`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", accept: "text/event-stream", "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: this.config.model, max_tokens: this.config.maxTokens, system: systemPrompt || undefined, messages: [{ role: "user", content: `${context ? `Page context:\n${context}\n\n` : ""}${prompt}` }], stream: true })
    });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status}): ${await response.text().catch(() => "")}`);
    yield* readSSE(response, signal, (event) => event.type === "content_block_delta" ? event.delta?.text || "" : "");
  }
  async testConnection() { return { status: "configured", models: [this.config.model] }; }
}
