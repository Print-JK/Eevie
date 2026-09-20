export class LocalTTSManager {
  constructor() {
    this.isEnabled = true;
    this.pipeline = null;
    this.audioQueue = [];
    this.isPlaying = false;
  }

  async initialize() {
    // Dynamically instantiate Transformers.js speech synthesis pipeline
    const { pipeline, env } = await import(browser.runtime.getURL('lib/vendor/transformers.min.js'));
    env.allowLocalModels = true;
    env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('lib/vendor/');
    
    // Xenova/speecht5_tts or kokoro-82m quantized for browser runtime
    this.synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
      quantized: true
    });
    this.speakerEmbeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
  }

  setEnabled(status) {
    this.isEnabled = status;
    if (!status) {
      this.stop();
    }
  }

  async speak(text) {
    if (!this.isEnabled || !text.trim()) return;

    // Segment text by clause to stream speech rapidly
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      if (!this.isEnabled) break;

      const out = await this.synthesizer(sentence, {
        speaker_embeddings: this.speakerEmbeddings
      });
      
      await this._playBuffer(out.audio, out.sampling_rate);
    }
  }

  async _playBuffer(audioData, sampleRate) {
    return new Promise((resolve) => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      const buffer = audioCtx.createBuffer(1, audioData.length, sampleRate);
      buffer.copyToChannel(audioData, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        audioCtx.close();
        resolve();
      };
      this.currentAudioSource = source;
      source.start();
    });
  }

  stop() {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (_) {}
      this.currentAudioSource = null;
    }
  }
}