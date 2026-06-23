/**
 * PromptHub - Core Client Script
 */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Shared Toast Helper ──────────────────────────────────────
  const toast = document.getElementById('success-toast');
  const toastMessage = document.getElementById('toast-message');
  let toastTimer = null;

  function showToast(message) {
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add('show');

    // Clear any existing timer so rapid clicks reset it
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 2500);
  }

  // ─── Copy Prompt Logic ────────────────────────────────────────
  const copyBtn = document.getElementById('copy-prompt-btn');
  const promptTextarea = document.getElementById('prompt-text');

  if (copyBtn && promptTextarea) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(promptTextarea.value);
        showToast('✅ Prompt copied successfully!');
      } catch (err) {
        // Fallback for older browsers
        try {
          promptTextarea.select();
          document.execCommand('copy');
          showToast('✅ Prompt copied successfully!');
        } catch (fallbackErr) {
          alert('Could not copy automatically. Please select the text and copy manually.');
        }
      }
    });
  }

  // ─── Share Button Logic (Feature 4) ──────────────────────────
  const shareBtn = document.getElementById('share-btn');

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const pageUrl = window.location.href;
      try {
        await navigator.clipboard.writeText(pageUrl);
        showToast('🔗 Link Copied! Share with friends');
      } catch (err) {
        // Fallback
        try {
          const tempInput = document.createElement('input');
          tempInput.value = pageUrl;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
          showToast('🔗 Link Copied! Share with friends');
        } catch (fallbackErr) {
          alert('Could not copy link automatically. Please copy the URL from the address bar.');
        }
      }
    });
  }

  // ─── Search Input Auto-capitalization & Validation ───────────
  const searchInput = document.getElementById('search-keyword');
  const searchForm = document.getElementById('search-form');

  if (searchInput) {
    // Force uppercase and remove special characters/spaces during input
    searchInput.addEventListener('input', (e) => {
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const cleanVal = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      e.target.value = cleanVal;
      // Maintain cursor position
      e.target.setSelectionRange(start, end);
    });

    // Form submit validation
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        const val = searchInput.value.trim();
        if (!val) {
          e.preventDefault();
          searchInput.focus();
        }
      });
    }
  }

});
