// lib/voice/tts/webspeech-engine.js
import { BaseTTSEngine } from "./base-tts-engine.js";

export class WebSpeechEngine extends BaseTTSEngine {
  constructor(config = {}) {
    super(config);
    this.synth = window.speechSynthesis;
  }

  async getVoices() {
    return new Promise((resolve) => {
      let voices = this.synth.getVoices();
      if (voices.length > 0) return resolve(this._formatVoices(voices));

      this.synth.onvoiceschanged = () => {
        voices = this.synth.getVoices();
        resolve(this._formatVoices(voices));
      };

      // Fallback timeout for Firefox
      setTimeout(() => resolve(this._formatVoices(this.synth.getVoices())), 400);
    });
  }

  _formatVoices(voices) {
    return voices.map((v) => ({
      id: v.voiceURI,
      name: `${v.name} (${v.lang})`,
      lang: v.lang
    }));
  }

  async synthesize(text, { voice, rate = 1.0, pitch = 1.0 }) {
    if (!this.synth) return;

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;

      if (voice) {
        const available = this.synth.getVoices();
        const matched = available.find((v) => v.voiceURI === voice);
        if (matched) utterance.voice = matched;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") {
          resolve(); // Expected upon user cancel
        } else {
          reject(e);
        }
      };

      this.synth.speak(utterance);
    });
  }

  cancel() {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}