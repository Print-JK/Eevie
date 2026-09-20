(() => {
  let suggestionPill = null;

  // Listen for user text highlight events
  document.addEventListener('mouseup', (event) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 5) {
      showSuggestionPill(event.pageX, event.pageY, selectedText);
    } else if (suggestionPill) {
      removeSuggestionPill();
    }
  });

  function showSuggestionPill(x, y, text) {
    removeSuggestionPill();

    suggestionPill = document.createElement('div');
    suggestionPill.className = 'eevie-suggestion-pill';
    suggestionPill.innerHTML = `
      <div class="eevie-pill-btn" id="eevie-action-summarize">
        <span>⚡ Summarize with Eevie</span>
      </div>
    `;

    suggestionPill.style.left = `${x + 10}px`;
    suggestionPill.style.top = `${y - 35}px`;
    document.body.appendChild(suggestionPill);

    document.getElementById('eevie-action-summarize').addEventListener('click', (e) => {
      e.stopPropagation();
      browser.runtime.sendMessage({
        type: 'TRIGGER_ACTION',
        action: 'summarize',
        payload: text
      });
      removeSuggestionPill();
    });
  }

  function removeSuggestionPill() {
    if (suggestionPill) {
      suggestionPill.remove();
      suggestionPill = null;
    }
  }

  // Handle document structural data harvesting on demand
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_PAGE_CONTEXT') {
      const pageTitle = document.title;
      // Strip script, style, and navigation noise
      const clone = document.body.cloneNode(true);
      const elementsToRemove = clone.querySelectorAll('script, style, nav, footer, noscript');
      elementsToRemove.forEach(el => el.remove());
      
      const cleanContent = clone.innerText
        .replace(/\s+/g, ' ')
        .slice(0, 10000); // Window context safety bound

      sendResponse({
        title: pageTitle,
        url: window.location.href,
        content: cleanContent
      });
    }
  });
})();