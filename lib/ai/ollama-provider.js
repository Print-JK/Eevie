import { BaseAIProvider } from "./base-provider.js";

export class OllamaProvider extends BaseAIProvider {
  constructor(config) {
    super({
      endpoint: config.endpoint || "http://localhost:11434",
      model: config.model || "llama3.2:3b",
      ...config
    });
  }

  async *streamComplete({ prompt, context, systemPrompt, signal }) {
    const fullPrompt = `${systemPrompt ? `[SYSTEM]: ${systemPrompt}\n` : ""}${
      context ? `[CONTEXT]: ${context}\n` : ""
    }[USER]: ${prompt}`;

    const res = await fetch(`${this.config.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt: fullPrompt,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("[Ollama Error Payload]:", errorText);
      throw new Error(`Ollama failed (${res.status} ${res.statusText}): ${errorText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete trailing slice

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);
          if (parsed.response) {
            yield parsed.response;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async testConnection() {
    const res = await fetch(`${this.config.endpoint}/api/tags`);
    if (!res.ok) throw new Error("Could not reach Ollama instance");
    const data = await res.json();
    return { status: "ok", models: data.models?.map((m) => m.name) || [] };
  }
}