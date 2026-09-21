import { OllamaProvider } from "./ollama-provider.js";

export class AIProviderManager {
  constructor() {
    this.registry = new Map();
    this.activeProviderInstance = null;
    
    // Register defaults
    this.register("ollama", OllamaProvider);
  }

  register(name, ProviderClass) {
    this.registry.set(name, ProviderClass);
  }

  setActiveProvider(type, config) {
    const ProviderClass = this.registry.get(type);
    if (!ProviderClass) {
      throw new Error(`Provider "${type}" is not registered in AIProviderManager.`);
    }
    this.activeProviderInstance = new ProviderClass(config);
  }

  get provider() {
    if (!this.activeProviderInstance) {
      throw new Error("No active AI provider configured.");
    }
    return this.activeProviderInstance;
  }
}