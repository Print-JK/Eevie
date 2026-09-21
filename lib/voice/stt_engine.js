// lib/voice/stt_engine.js
export class STTEngine {
  constructor(onResult, onError, onEnd, onVolumeChange) {
    this.onResult = onResult;
    this.onError = onError;
    this.onEnd = onEnd;
    this.onVolumeChange = onVolumeChange;

    this.recognition = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.isListening = false;

    this._initNative();
  }

  _initNative() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = "en-US";

      this.recognition.onresult = (e) => {
        if (e.results && e.results[0] && e.results[0][0]) {
          const transcript = e.results[0][0].transcript;
          console.log("[Eevie STT] Native Transcript:", transcript);
          if (this.onResult) this.onResult(transcript);
        }
      };

      this.recognition.onerror = (e) => {
        console.warn("[Eevie STT] Native Recognition error:", e.error);
        if (this.onError) this.onError(e.error);
        this.stop();
      };

      this.recognition.onend = () => {
        console.log("[Eevie STT] Recognition stream ended.");
        this.stop();
      };
    }
  }

  async start() {
    if (this.isListening) return;

    try {
      // 1. Explicitly request hardware microphone access (triggers browser prompt)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isListening = true;

      // 2. Attach an Audio Visualizer monitor so the user knows sound is coming in
      this._monitorAudioLevels(this.mediaStream);

      // 3. Start speech recognition engine if available
      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (recErr) {
          console.warn("[Eevie STT] recognition.start() note:", recErr.message);
        }
      } else {
        if (this.onError) {
          this.onError("SpeechRecognition API missing. Using mic monitor only.");
        }
      }
    } catch (err) {
      console.error("[Eevie STT] Mic permission denied or unavailable:", err);
      this.stop();
      if (this.onError) this.onError(`Microphone access error: ${err.message}`);
    }
  }

  _monitorAudioLevels(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const buffer = new Uint8Array(this.analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!this.isListening) return;
      this.analyser.getByteFrequencyData(buffer);

      // Compute average volume level (0 - 100)
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i];
      const avg = Math.round(sum / buffer.length);

      if (this.onVolumeChange) this.onVolumeChange(avg);
      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  stop() {
    if (!this.isListening) return;
    this.isListening = false;

    // Stop audio monitor
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }

    // Release hardware microphone
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Stop native recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    if (this.onEnd) this.onEnd();
  }
}