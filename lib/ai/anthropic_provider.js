import { BaseLLMAdapter } from './adapter_interface.js';

export class AnthropicAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  async *stream(messages, options = {}) {
    // Separate system instructions for Claude API requirements
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerously-allow-browser': 'true' // Client context requirement
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens || 2048,
        system: systemMessage,
        messages: userMessages,
        stream: true
      })
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const event of events) {
        const line = event.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const data = JSON.parse(line.replace('data: ', ''));
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text;
        }
      }
    }
  }
}