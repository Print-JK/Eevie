export class BaseLLMAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  async generate(messages, options = {}) {
    throw new Error("Method 'generate()' must be implemented.");
  }

  async *stream(messages, options = {}) {
    throw new Error("Method 'stream()' must be implemented.");
  }
}