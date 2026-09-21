
export class BaseTTSEngine {
  constructor(config = {}) {
    this.config = config;
  }

  async getVoices() {
    return [];
  }

  async synthesize(text, options = {}) {
    throw new Error("synthesize() must be implemented by engine subclasses");
  }

  cancel() {

  }
}