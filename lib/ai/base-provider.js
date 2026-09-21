export class BaseAIProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Must yield incremental text tokens as an AsyncGenerator
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.context]
   * @param {string} [params.systemPrompt]
   * @param {AbortSignal} [params.signal]
   * @returns {AsyncGenerator<string>}
   */
  async *streamComplete({ prompt, context, systemPrompt, signal }) {
    throw new Error("streamComplete() must be implemented by concrete subclass");
  }

  async testConnection() {
    throw new Error("testConnection() must be implemented");
  }
}