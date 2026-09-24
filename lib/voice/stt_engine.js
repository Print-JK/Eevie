// Native recognition first; a recorded Blob is retained for a local Whisper
// endpoint/worker when Firefox exposes no SpeechRecognition implementation.
export class STTEngine {
  constructor(onResult, onError, onEnd, onVolumeChange, config = {}) {
    Object.assign(this, { onResult, onError, onEnd, onVolumeChange, config: { endpoint: "", ...config }, recognition: null, mediaStream: null, recorder: null, chunks: [], audioContext: null, analyser: null, animFrameId: null, isListening: false, gotNativeResult: false, stopping: false });
    this._initNative();
  }
  _initNative() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    this.recognition = new Recognition(); Object.assign(this.recognition, { continuous: false, interimResults: false, lang: this.config.lang || "en-US" });
    this.recognition.onresult = (event) => { const text = event.results?.[0]?.[0]?.transcript?.trim(); if (text) { this.gotNativeResult = true; this.onResult?.(text); } };
    this.recognition.onerror = () => { /* onend records/transcribes if no result */ };
    this.recognition.onend = () => { if (this.isListening && !this.stopping) this.stop(); };
  }
  setConfig(config = {}) { this.config = { ...this.config, ...config }; if (this.recognition && config.lang) this.recognition.lang = config.lang; }
  async start() {
    if (this.isListening) return;
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); this.isListening = true; this.gotNativeResult = false; this.stopping = false;
      this._monitorAudioLevels(this.mediaStream); this._startRecorder(this.mediaStream);
      try { this.recognition?.start(); } catch (error) { console.warn("[Eevie STT] Native recognizer unavailable", error); }
    } catch (error) { this._cleanup(); this.onError?.(`Microphone access error: ${error.message}`); this.onEnd?.(); }
  }
  _startRecorder(stream) {
    if (!window.MediaRecorder) return;
    try { this.recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "" }); this.chunks = []; this.recorder.ondataavailable = (event) => event.data.size && this.chunks.push(event.data); this.recorder.start(250); } catch (error) { console.warn("[Eevie STT] Recorder unavailable", error); }
  }
  _monitorAudioLevels(stream) {
    const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
    this.audioContext = new Context(); const source = this.audioContext.createMediaStreamSource(stream); this.analyser = this.audioContext.createAnalyser(); this.analyser.fftSize = 256; source.connect(this.analyser); const samples = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => { if (!this.isListening) return; this.analyser.getByteFrequencyData(samples); this.onVolumeChange?.(Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)); this.animFrameId = requestAnimationFrame(tick); }; tick();
  }
  async stop() {
    if (!this.isListening || this.stopping) return; this.stopping = true;
    const blob = await this._finishRecording(); const shouldFallback = !this.gotNativeResult;
    this._cleanup();
    try { if (shouldFallback && blob?.size) { const transcript = await this._transcribeFallback(blob); if (transcript) this.onResult?.(transcript); else this.onError?.("No speech was recognized."); } } catch (error) { this.onError?.(`Local transcription failed: ${error.message}`); } finally { this.onEnd?.(); }
  }
  _finishRecording() { return new Promise((resolve) => { if (!this.recorder || this.recorder.state === "inactive") return resolve(this.chunks.length ? new Blob(this.chunks, { type: this.chunks[0].type }) : null); this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType || "audio/webm" })); this.recorder.stop(); }); }
  async _transcribeFallback(blob) {
    // A user-configured local Whisper server is deterministic and avoids sending voice off-device.
    if (this.config.endpoint) { const form = new FormData(); form.append("file", blob, "speech.webm"); form.append("model", this.config.model || "whisper-tiny.en"); const response = await fetch(this.config.endpoint, { method: "POST", body: form }); if (!response.ok) throw new Error(`endpoint returned ${response.status}`); const data = await response.json(); return data.text?.trim() || ""; }
    throw new Error("SpeechRecognition is unavailable and no local Whisper endpoint is configured.");
  }
  _cleanup() { this.isListening = false; this.stopping = false; if (this.animFrameId) cancelAnimationFrame(this.animFrameId); this.animFrameId = null; this.audioContext?.close().catch(() => {}); this.audioContext = null; this.mediaStream?.getTracks().forEach((track) => track.stop()); this.mediaStream = null; try { this.recognition?.stop(); } catch (_) {} this.recorder = null; }
}
