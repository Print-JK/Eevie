import { BaseTTSEngine } from "./base-tts-engine.js";

/**
 * Worker-backed local neural TTS. Model files must be packaged under
 * lib/models/kokoro/; no CDN request is ever made by this engine.
 */
export class KokoroEngine extends BaseTTSEngine {
  constructor(config = {}) { super(config); this.worker = null; this.jobs = new Map(); this.sources = new Set(); this.nextId = 0; }
  async getVoices() { return [{ id: "af_heart", name: "Heart (Kokoro, US English)", lang: "en-US" }, { id: "am_adam", name: "Adam (Kokoro, US English)", lang: "en-US" }]; }
  _worker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("./workers/kokoro-worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data.id); if (!job) return;
      if (data.type === "error") { this.jobs.delete(data.id); job.reject(new Error(data.message)); return; }
      if (data.type === "audio") { this._play(data.samples, data.sampleRate, job).catch(job.reject); }
    };
    return this.worker;
  }
  synthesize(text, options = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId; this.jobs.set(id, { resolve, reject, options });
      this._worker().postMessage({ type: "synthesize", id, text, voice: options.voice || "af_heart" });
    });
  }
  async _play(samples, sampleRate, job) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Web Audio is unavailable.");
    const context = new Context(); await context.resume();
    const audio = context.createBuffer(1, samples.length, sampleRate); audio.copyToChannel(new Float32Array(samples), 0);
    const source = context.createBufferSource(); const gain = context.createGain(); gain.gain.value = job.options.volume ?? 1;
    source.buffer = audio; source.playbackRate.value = job.options.rate || 1; source.connect(gain).connect(context.destination);
    this.sources.add(source); source.onended = () => { this.sources.delete(source); context.close().catch(() => {}); job.resolve(); };
    source.start();
  }
  cancel() { this.worker?.postMessage({ type: "cancel" }); for (const source of this.sources) source.stop(); this.sources.clear(); for (const job of this.jobs.values()) job.resolve(); this.jobs.clear(); }
}
