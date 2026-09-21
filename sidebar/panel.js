// sidebar/panel.js
import { AIProviderManager } from "../lib/ai/provider-manager.js";
import { TTSManager } from "../lib/voice/tts_engine.js";
import { STTEngine } from "../lib/voice/stt_engine.js";

// 1. Initialize Managers
const aiManager = new AIProviderManager();
const ttsManager = new TTSManager();

// Configure local default LLM
aiManager.setActiveProvider("ollama", {
  endpoint: "http://localhost:11434",
  model: "qwen2.5:3b"
});

// 2. DOM Elements
const chatStream = document.getElementById("chat-stream");
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const ttsToggle = document.getElementById("tts-toggle");

const micTrigger = document.getElementById("mic-trigger");
const micLabel = document.getElementById("mic-label");
const modeTextBtn = document.getElementById("mode-text-btn");
const modeVoiceBtn = document.getElementById("mode-voice-btn");
const textPanel = document.getElementById("text-input-panel");
const voicePanel = document.getElementById("voice-input-panel");

let currentAbortController = null;

// 3. TTS Mute / Unmute Button
if (ttsToggle) {
  ttsToggle.addEventListener("click", () => {
    const newState = !ttsManager.enabled;
    ttsManager.setEnabled(newState);
    ttsToggle.textContent = newState ? "🔊" : "🔇";
  });
}

// 4. Mode Switching (Text vs Voice)
if (modeTextBtn && modeVoiceBtn && textPanel && voicePanel) {
  modeTextBtn.addEventListener("click", () => {
    modeTextBtn.classList.add("active");
    modeVoiceBtn.classList.remove("active");
    textPanel.classList.remove("hidden");
    voicePanel.classList.add("hidden");
  });

  modeVoiceBtn.addEventListener("click", () => {
    modeVoiceBtn.classList.add("active");
    modeTextBtn.classList.remove("active");
    voicePanel.classList.remove("hidden");
    textPanel.classList.add("hidden");
  });
}

// 5. STT Engine Initialization with Null Guards
const stt = new STTEngine(
  (transcript) => {
    appendMessage("user", transcript);
    executeChatTurn(transcript);
  },
  (error) => {
    console.error("STT Error:", error);
    if (micLabel) micLabel.textContent = `Error: ${error}`;
    if (micTrigger) micTrigger.classList.remove("recording");
  },
  () => {
    // onEnd callback: Guaranteed reset of UI
    if (micTrigger) micTrigger.classList.remove("recording");
    if (micLabel) micLabel.textContent = "Press to Talk";
  },
  (volume) => {
    // Visual feedback: shows live audio level in the label
    if (micLabel && stt.isListening) {
      micLabel.textContent = volume > 5 ? `Listening (level: ${volume})...` : "Listening...";
    }
  }
);

if (micTrigger) {
  micTrigger.addEventListener("click", () => {
    if (stt.isListening) {
      stt.stop();
    } else {
      if (micTrigger) micTrigger.classList.add("recording");
      if (micLabel) micLabel.textContent = "Initializing Mic...";
      stt.start();
    }
  });
}
}

// 6. Text Mode Event Handlers
if (sendBtn && promptInput) {
  sendBtn.addEventListener("click", () => {
    const query = promptInput.value.trim();
    if (!query) return;
    promptInput.value = "";
    executeChatTurn(query);
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
}

// 7. Query Execution Pipeline (Accepts custom context directly)
async function executeChatTurn(userText, explicitContext = null) {
  if (currentAbortController) {
    currentAbortController.abort();
    ttsManager.stop();
  }
  currentAbortController = new AbortController();

  appendMessage("user", userText);
  const agentMessageBubble = appendMessage("agent", "Thinking...");

  // Use explicitContext if passed (e.g. from highlight selection), otherwise fetch from active tab
  const pageContext = explicitContext !== null ? explicitContext : await getActiveTabContext();

  try {
    const stream = aiManager.provider.streamComplete({
      prompt: userText,
      context: pageContext,
      systemPrompt: "You are Eevie, an intelligent browser assistant. Provide direct, informative, well-formatted summaries and answers.",
      signal: currentAbortController.signal
    });

    let isFirstToken = true;

    for await (const token of stream) {
      if (isFirstToken) {
        agentMessageBubble.textContent = "";
        isFirstToken = false;
      }
      agentMessageBubble.textContent += token;
      if (chatStream) chatStream.scrollTop = chatStream.scrollHeight;
      ttsManager.ingestToken(token);
    }

    ttsManager.flush();
  } catch (err) {
    if (err.name === "AbortError") {
      agentMessageBubble.textContent += " [Interrupted]";
    } else {
      agentMessageBubble.textContent = `Error: ${err.message}`;
    }
  } finally {
    currentAbortController = null;
  }
}

// 8. Safe Tab Context Extraction
async function getActiveTabContext() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith("about:") || tab.url?.startsWith("moz-extension://")) {
      return "";
    }

    const response = await browser.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTEXT" });
    return response?.context || "";
  } catch (err) {
    return "";
  }
}

function appendMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  if (chatStream) {
    chatStream.appendChild(bubble);
    chatStream.scrollTop = chatStream.scrollHeight;
  }
  return bubble;
}

// 9. Runtime Message Listener for Highlight Suggestions
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "REQUEST_SIDEBAR_SUMMARY" && message.selectedText) {
    executeChatTurn("Summarize this selected passage concisely in 3 bullets:", message.selectedText);
  }
});