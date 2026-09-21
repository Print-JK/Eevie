import { BaseTTSEngine } from "../base-tts-engine.js";

export class KokoroEngine extends BaseTTSEngine {
  constructor(config) {
    super(config);
    this.worker = null;
    this.isReady = false;
    this.initWorker();
  }

  initWorker() {
    // Runs inference off the UI thread via transformers.js / kokoro-js
    this.worker = new Worker(new URL("./workers/kokoro-worker.js", import.meta.url), { type: "module" });
    this.worker.postMessage({ type: "INIT", model: "onnx-community/Kokoro-82M-v1.0-ONNX" });
  }

  async getVoices() {
    return [
      { id: "af_heart", name: "Heart (Natural Female)", lang: "en-US" },
      { id: "am_adam", name: "Adam (Natural Male)", lang: "en-US" },
      { id: "bf_emma", name: "Emma (British Female)", lang: "en-GB" }
    ];
  }

  async synthesize(text, { voice = "af_heart" }) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        const { audioBuffer } = event.data;
        this.playBuffer(audioBuffer, resolve);
      };
      this.worker.postMessage({ type: "SYNTHESIZE", text, voice }, [channel.port2]);
    });
  }

  playBuffer(buffer, onEnd) {
    // Play using Web Audio API AudioBufferSourceNode
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = onEnd;
    source.start(0);
  }

  cancel() {
    if (this.worker) this.worker.postMessage({ type: "CANCEL" });
  }
}