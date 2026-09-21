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
      const article = document.querySelector("article") || document.querySelector("main") || document.body;
      sendResponse({ context: article ? article.innerText.slice(0, 5000) : "" });
    }
  });
})();