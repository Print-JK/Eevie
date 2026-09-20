import { LocalLLMAdapter } from '../lib/ai/local_provider.js';
import { AnthropicAdapter } from '../lib/ai/anthropic_provider.js';
import { LocalTTSManager } from '../lib/voice/tts_engine.js';
import { LocalSpeechToText } from '../lib/voice/stt_engine.js';

let activeMode = 'text'; // 'text' | 'voice'
const tts = new LocalTTSManager();
const stt = new LocalSpeechToText();

// Initialize Engines
(async () => {
  await tts.initialize();
  await stt.initialize();
})();

// Active Provider Orchestrator
function getProvider() {
  const selected = document.getElementById('provider-selector').value;
  if (selected === 'ollama') {
    return new LocalLLMAdapter({ baseUrl: 'http://localhost:11434', type: 'ollama' });
  } else if (selected === 'lmstudio') {
    return new LocalLLMAdapter({ baseUrl: 'http://127.0.0.1:1234/v1', type: 'openai-compatible' });
  } else if (selected === 'claude') {
    return new AnthropicAdapter({ apiKey: 'YOUR_ANTHROPIC_KEY' });
  }
}

// UI Bindings
document.getElementById('tts-toggle').addEventListener('change', (e) => {
  tts.setEnabled(e.target.checked);
});

document.getElementById('mode-text-btn').addEventListener('click', () => setMode('text'));
document.getElementById('mode-voice-btn').addEventListener('click', () => setMode('voice'));

function setMode(mode) {
  activeMode = mode;
  document.getElementById('mode-text-btn').classList.toggle('active', mode === 'text');
  document.getElementById('mode-voice-btn').classList.toggle('active', mode === 'voice');
  document.getElementById('text-input-wrapper').classList.toggle('hidden', mode === 'voice');
  document.getElementById('voice-input-wrapper').classList.toggle('hidden', mode === 'text');
}

// Execution Pipeline
async function handleQuery(queryText) {
  renderMessage(queryText, 'user');
  const provider = getProvider();
  
  // Harvest context from active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const pageContext = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTEXT' });

  const messages = [
    { role: 'system', content: `Contextual page analysis: Title: "${pageContext.title}". Extracted Page Content: ${pageContext.content}` },
    { role: 'user', content: queryText }
  ];

  let botMessageDiv = renderMessage('', 'assistant');
  let accumulatedResponse = '';

  try {
    for await (const chunk of provider.stream(messages)) {
      accumulatedResponse += chunk;
      botMessageDiv.textContent = accumulatedResponse;
    }
    // Fire Text-to-Speech upon completion if enabled
    await tts.speak(accumulatedResponse);
  } catch (err) {
    botMessageDiv.textContent = `Error: ${err.message}`;
  }
}

// STT Event Flow
let isListening = false;
const micButton = document.getElementById('mic-trigger');
const voiceStatus = document.getElementById('voice-status');

micButton.addEventListener('click', async () => {
  if (!isListening) {
    isListening = true;
    micButton.classList.add('recording');
    voiceStatus.textContent = 'Listening...';
    await stt.startListening((transcription) => {
      voiceStatus.textContent = 'Processing...';
      handleQuery(transcription);
    });
  } else {
    isListening = false;
    micButton.classList.remove('recording');
    voiceStatus.textContent = 'Tap to Speak';
    await stt.stopListening();
  }
});

function renderMessage(text, role) {
  const container = document.getElementById('chat-stream');
  const msg = document.createElement('div');
  msg.className = `chat-bubble ${role}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

// Listen for Context-Script Summarize Trigger
browser.runtime.onMessage.addListener((req) => {
  if (req.type === 'TRIGGER_ACTION' && req.action === 'summarize') {
    handleQuery(`Summarize this selection: "${req.payload}"`);
  }
});