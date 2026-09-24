// The extension ships no hidden network fallback: install model assets in
// lib/models/kokoro/ and expose a compatible local inference implementation here.
// This explicit error lets the manager continue with Web Speech if assets are absent.
self.onmessage = ({ data }) => {
  if (data.type === "synthesize") self.postMessage({ type: "error", id: data.id, message: "Kokoro model assets are not packaged. Add the licensed ONNX model and tokenizer under lib/models/kokoro/." });
};
