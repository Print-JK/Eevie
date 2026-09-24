// lib/voice/tts_engine.js
import { WebSpeechEngine } from "./tts/webspeech-engine.js";
import { KokoroEngine } from "./tts/kokoro-engine.js";

export class TTSManager {
  constructor() {
    this.engines = new Map();
    this.activeEngine = null;
    this.activeVoiceId = null;
    this.enabled = true;

    // Stream & Sentence Queuing State
    this.queue = [];
    this.isPlaying = false;
    this.streamBuffer = "";

    // Register out-of-the-box browser engine
    this.registerEngine("webspeech", new WebSpeechEngine());
    this.registerEngine("kokoro", new KokoroEngine());
    this.setEngine("webspeech");
  }

  registerEngine(name, instance) {
    this.engines.set(name, instance);
  }

  async setEngine(name) {
    this.stop();
    const engine = this.engines.get(name);
    if (!engine) throw new Error(`Engine ${name} is not registered.`);
    this.activeEngine = engine;
    const voices = await this.activeEngine.getVoices();
    if (voices.length > 0) {
      this.activeVoiceId = voices[0].id;
    }
    return voices;
  }

  setVoice(voiceId) {
    this.activeVoiceId = voiceId;
  }

  setEnabled(state) {
    this.enabled = state;
    if (!state) this.stop();
  }

  stop() {
    this.queue = [];
    this.streamBuffer = "";
    this.isPlaying = false;
    if (this.activeEngine) {
      this.activeEngine.cancel();
    }
  }

  // Ingests raw chunks from AI token stream
  ingestToken(token) {
    if (!this.enabled) return;

    this.streamBuffer += token;

    // Splits completed sentence clauses ending in ., !, ?, or newline
    const sentenceRegex = /^([\s\S]*?[.!?\n])(?=\s|$)/;
    let match;
    while ((match = this.streamBuffer.match(sentenceRegex))) {
      const sentence = match[1].trim();
      this.streamBuffer = this.streamBuffer.slice(match[0].length).replace(/^\s+/, "");
      if (sentence) this.enqueue(sentence);
    }
  }

  // Flushes lingering tokens once AI finishes generation
  flush() {
    if (!this.enabled) return;
    if (this.streamBuffer.trim().length > 0) {
      this.enqueue(this.streamBuffer.trim());
      this.streamBuffer = "";
    }
  }

  enqueue(text) {
    this.queue.push(text);
    this.processQueue();
  }

  async processQueue() {
    if (this.isPlaying || this.queue.length === 0 || !this.enabled) return;
    this.isPlaying = true;

    const sentenceToPlay = this.queue.shift();
    try {
      await this.activeEngine.synthesize(sentenceToPlay, { voice: this.activeVoiceId, rate: this.rate || 1, pitch: this.pitch || 1, volume: this.volume ?? 1 });
    } catch (err) {
      console.error("Audio playback failure:", err);
    } finally {
      this.isPlaying = false;
      this.processQueue();
    }
  }
}
