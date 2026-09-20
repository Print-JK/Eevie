import { BaseLLMAdapter } from './adapter_interface.js';

export class LocalLLMAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // Defaults to Ollama standard port; LM Studio runs on http://127.0.0.1:1234/v1
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama3:latest';
    this.type = config.type || 'ollama'; // 'ollama' | 'openai-compatible'
  }

  async *stream(messages, options = {}) {
    const endpoint = this.type === 'ollama' 
      ? `${this.baseUrl}/api/chat` 
      : `${this.baseUrl}/chat/completions`;

    const payload = this.type === 'ollama' ? {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      options: { temperature: options.temperature ?? 0.7 }
    } : {
      model: this.model,
      messages: messages,
      stream: true,
      temperature: options.temperature ?? 0.7
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Local inference node responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep unfinished chunk in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (this.type === 'ollama') {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } else {
          // SSE format: data: {...}
          const cleanLine = line.replace(/^data:\s*/, '');
          if (cleanLine === '[DONE]') return;
          const parsed = JSON.parse(cleanLine);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        }
      }
    }
  }
}