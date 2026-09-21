import { WebSpeechEngine } from "./tts/engines/webspeech-engine.js";
import { KokoroEngine } from "./tts/engines/kokoro-engine.js";

export class TTSManager {
  constructor() {
    this.engines = new Map();
    this.activeEngine = null;
    this.activeVoice = null;
    this.enabled = true;
    
    // Playback state
    this.queue = [];
    this.isPlaying = false;
    this.streamBuffer = "";

    // Register out-of-the-box engines
    this.registerEngine("webspeech", new WebSpeechEngine());
    this.registerEngine("kokoro", new KokoroEngine());
    this.setEngine("webspeech");
  }

  registerEngine(name, instance) {
    this.engines.set(name, instance);
  }

  async setEngine(name) {
    this.stop();
    if (!this.engines.has(name)) throw new Error(`TTS Engine ${name} not found`);
    this.activeEngine = this.engines.get(name);
    const voices = await this.activeEngine.getVoices();
    if (voices.length > 0) this.activeVoice = voices[0].id;
    return voices;
  }

  setVoice(voiceId) {
    this.activeVoice = voiceId;
  }

  setEnabled(state) {
    this.enabled = state;
    if (!state) this.stop();
  }

  stop() {
    this.queue = [];
    this.streamBuffer = "";
    this.isPlaying = false;
    if (this.activeEngine) this.activeEngine.cancel();
  }

  /**
   * Accepts incoming streaming tokens from LLM and queues completed clauses
   */
  ingestToken(token) {
    if (!this.enabled) return;

    this.streamBuffer += token;
    // Regex splits on typical clause/sentence endings (. ! ? ; or newline)
    const match = this.streamBuffer.match(/^([\s\S]+?[.!?;\n])\s+([\s\S]*)$/);
    if (match) {
      const sentence = match[1].trim();
      this.streamBuffer = match[2];
      if (sentence.length > 0) {
        this.enqueue(sentence);
      }
    }
  }

  /**
   * Flushes any remaining incomplete sentence buffers once the LLM finishes
   */
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

    const textToSpeak = this.queue.shift();
    try {
      await this.activeEngine.synthesize(textToSpeak, { voice: this.activeVoice });
    } catch (err) {
      console.error("TTS playback error on phrase:", textToSpeak, err);
    } finally {
      this.isPlaying = false;
      this.processQueue();
    }
  }
}