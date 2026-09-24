// sidebar/panel.js
import { AIProviderManager } from "../lib/ai/provider-manager.js";
import { TTSManager } from "../lib/voice/tts_engine.js";
import { STTEngine } from "../lib/voice/stt_engine.js";

// 1. Initialize Managers
const aiManager = new AIProviderManager();
const ttsManager = new TTSManager();

const settingsDefaults = { provider: "ollama", endpoint: "http://localhost:11434", model: "qwen2.5:3b", apiKey: "", ttsEngine: "webspeech", voice: "", rate: 1, pitch: 1, whisperEndpoint: "" };
let settings = settingsDefaults;
async function initializeSettings() {
  settings = { ...settingsDefaults, ...(await browser.storage.local.get(settingsDefaults)) };
  aiManager.setActiveProvider(settings.provider, { endpoint: settings.endpoint, model: settings.model, apiKey: settings.apiKey });
  await ttsManager.setEngine(settings.ttsEngine);
  if (settings.voice) ttsManager.setVoice(settings.voice);
  ttsManager.rate = settings.rate; ttsManager.pitch = settings.pitch;
  stt?.setConfig({ endpoint: settings.whisperEndpoint });
  const badge = document.querySelector(".status-badge");
  if (badge) badge.textContent = `${settings.provider}: ${settings.model}`;
}

// 2. DOM Elements
const chatStream = document.getElementById("chat-stream");
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const ttsToggle = document.getElementById("tts-toggle");
const settingsBtn = document.getElementById("settings-btn");

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
    ttsToggle.textContent = newState ? "🔊 Voice" : "🔇 Voice";
    ttsToggle.title = newState ? "Voice replies are on" : "Voice replies are off";
  });
}

if (settingsBtn) settingsBtn.addEventListener("click", () => browser.runtime.openOptionsPage());

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
  const command = parseMediaCommand(userText);
  if (command) {
    try {
      const result = await executeMediaCommand(command);
      const reply = result.message;
      appendMessage("agent", reply);
      speak(reply);
    } catch (error) {
      const reply = `I couldn't run that command: ${error.message}`;
      appendMessage("agent", reply);
      speak(reply);
    }
    return;
  }
  const agentMessageBubble = appendMessage("agent", "Thinking...");

  // Use explicitContext if passed (e.g. from highlight selection), otherwise fetch from active tab
  try {
    const pageContext = explicitContext !== null ? explicitContext : await getActiveTabContext();
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

    if (isFirstToken) agentMessageBubble.textContent = "No response returned.";
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

// Keep browser actions local and intentionally narrow: the model never supplies
// JavaScript or selectors, only this fixed set of media actions.
function parseMediaCommand(text) {
  const normalized = text.trim().toLowerCase().replace(/[!?.,]+$/g, "");
  const volume = normalized.match(/^(?:set )?(?:the )?volume(?: to)? (\d{1,3})(?:\s*(?:%|percent))?$/);
  if (volume) return { action: "setVolume", value: Math.max(0, Math.min(100, Number(volume[1]))) / 100 };
  if (/^(?:pause|stop)(?: (?:the |a )?(?:video|audio|media))?$/.test(normalized)) return { action: "pause" };
  if (/^(?:play|resume|continue)(?: (?:the |a )?(?:video|audio|media))?$/.test(normalized)) return { action: "play" };
  if (/^(?:mute)(?: (?:the |a )?(?:video|audio|media))?$/.test(normalized)) return { action: "mute" };
  if (/^(?:unmute)(?: (?:the |a )?(?:video|audio|media))?$/.test(normalized)) return { action: "unmute" };
  if (/^(?:lower|turn down|decrease)(?: (?:the )?volume)?$/.test(normalized)) return { action: "volumeDown", amount: 0.1 };
  if (/^(?:raise|turn up|increase)(?: (?:the )?volume)?$/.test(normalized)) return { action: "volumeUp", amount: 0.1 };
  const seek = normalized.match(/^(?:skip |seek )?(forward|back|backward) (\d+)(?:\s*(?:seconds?|secs?))?$/);
  if (seek) return { action: "seek", seconds: (seek[1] === "forward" ? 1 : -1) * Number(seek[2]) };
  return null;
}

async function executeMediaCommand(command) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("there is no active tab");
  const response = await browser.tabs.sendMessage(tab.id, { action: "EXECUTE_MEDIA_COMMAND", command });
  if (!response?.ok) throw new Error(response?.error || "no playable audio or video was found on this page");
  return response;
}

function speak(text) { ttsManager.ingestToken(text); ttsManager.flush(); }

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

initializeSettings().catch((error) => {
  console.error("[Eevie] Settings initialization failed", error);
  aiManager.setActiveProvider("ollama", settingsDefaults);
});
