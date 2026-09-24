// content/content_script.js
(() => {
  console.log("[Eevie] Content script injected and active on:", window.location.href);

  let floatingBtn = null;

  function removeFloatingAction() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
  }

  function renderFloatingAction(x, y, selectedText) {
    removeFloatingAction();

    floatingBtn = document.createElement("button");
    floatingBtn.id = "eevie-floating-trigger";
    floatingBtn.type = "button";
    floatingBtn.textContent = "✨ Summarize with Eevie";

    // Set high-priority inline styles to bypass any page stylesheet collisions
    Object.assign(floatingBtn.style, {
      position: "absolute",
      top: `${y + 10}px`,
      left: `${Math.max(10, x - 40)}px`,
      zIndex: "2147483647",
      backgroundColor: "#1e1e2e",
      color: "#cdd6f4",
      border: "1px solid #89b4fa",
      borderRadius: "8px",
      padding: "6px 12px",
      fontSize: "13px",
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      pointerEvents: "auto"
    });

    floatingBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[Eevie] Trigger clicked for selected text:", selectedText.slice(0, 50) + "...");

      browser.runtime.sendMessage({
        action: "REQUEST_SIDEBAR_SUMMARY",
        selectedText: selectedText
      });

      removeFloatingAction();
    });

    document.documentElement.appendChild(floatingBtn);
  }

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const text = selection.toString().trim();
      if (text.length > 20) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Use documentElement scroll offsets
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        renderFloatingAction(rect.left + scrollX, rect.bottom + scrollY, text);
      } else {
        removeFloatingAction();
      }
    }, 20); // Small delay to let selection settle
  });

  document.addEventListener("mousedown", (e) => {
    if (floatingBtn && !floatingBtn.contains(e.target)) {
      removeFloatingAction();
    }
  });

  // Listener for full-page context extraction
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_PAGE_CONTEXT") {
      browser.storage.local.get({ maxContextTokens: 6000 }).then(({ maxContextTokens }) => {
        sendResponse(extractReadablePage(Math.max(256, Number(maxContextTokens) || 6000)));
      }).catch(() => sendResponse(extractReadablePage(6000)));
      return true;
    }
  });

  // A small, packaged Readability-style extractor. It works on a cloned DOM so it
  // never mutates the page and deliberately falls back to visible body text.
  function extractReadablePage(maxTokens) {
    const root = document.body?.cloneNode(true);
    if (!root) return { title: document.title || "", byline: "", context: "" };
    root.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,aside,footer,form,button,[role='navigation'],[role='banner'],[role='complementary'],.advertisement,.ads,.ad,[class*='cookie'],[id*='cookie']").forEach((node) => node.remove());
    const candidates = [...root.querySelectorAll("article,main,[role='main'],section,div")];
    const score = (node) => {
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      const paragraphs = node.querySelectorAll("p,li").length;
      const linkText = [...node.querySelectorAll("a")].reduce((n, a) => n + (a.innerText || a.textContent || "").length, 0);
      return text.length + paragraphs * 120 - linkText * 0.7;
    };
    const best = candidates.filter((node) => (node.innerText || node.textContent || "").trim().length > 200).sort((a, b) => score(b) - score(a))[0] || root;
    const content = (best.innerText || best.textContent || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
    const title = document.querySelector("meta[property='og:title']")?.content || document.querySelector("h1")?.innerText?.trim() || document.title || "";
    const byline = document.querySelector("meta[name='author']")?.content || document.querySelector("[rel='author'],.author,[class*='byline']")?.innerText?.trim() || "";
    // Four characters per token is conservative enough to reserve room for the prompt.
    const maxChars = Math.max(1024, maxTokens * 4);
    const structured = [`Title: ${title}`, byline ? `Byline: ${byline}` : "", "", content].filter(Boolean).join("\n");
    return { title, byline, context: structured.slice(0, maxChars), truncated: structured.length > maxChars, estimatedTokens: Math.ceil(Math.min(structured.length, maxChars) / 4) };
  }
})();
