export class LocalSpeechToText {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }

  async initialize() {
    // Feature detect native API; fallback to local WebAssembly Whisper
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.nativeRecognizer = new SpeechConstructor();
      this.nativeRecognizer.continuous = false;
      this.nativeRecognizer.interimResults = false;
      this.useNative = true;
    } else {
      this.useNative = false;
      // Initialize local transcription worker using Transformers.js
      this.worker = new Worker(browser.runtime.getURL('lib/voice/stt_worker.js'), { type: 'module' });
    }
  }

  async startListening(onTranscriptionComplete) {
    if (this.useNative) {
      this.nativeRecognizer.onresult = (e) => {
        onTranscriptionComplete(e.results[0][0].transcript);
      };
      this.nativeRecognizer.start();
      return;
    }

    // WASM/AudioWorklet capture
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(stream);
    
    // Convert Float32Array PCM chunks for Whisper-Tiny inference
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.pcmBuffer = [];

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      this.pcmBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    this.isRecording = true;
    this.onResult = onTranscriptionComplete;
  }

  async stopListening() {
    if (this.useNative) {
      this.nativeRecognizer.stop();
      return;
    }

    this.isRecording = false;
    const totalLength = this.pcmBuffer.reduce((acc, b) => acc + b.length, 0);
    const mergedPCM = new Float32Array(totalLength);
    let offset = 0;
    for (const b of this.pcmBuffer) {
      mergedPCM.set(b, offset);
      offset += b.length;
    }

    this.worker.postMessage({ type: 'PROCESS_AUDIO', audio: mergedPCM });
    this.worker.onmessage = (e) => {
      if (e.data.type === 'TRANSCRIPTION_RESULT') {
        this.onResult(e.data.text);
      }
    };
  }
}