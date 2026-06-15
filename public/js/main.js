/**
 * PromptHub - Core Client Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Copy Prompt Logic ---
  const copyBtn = document.getElementById('copy-prompt-btn');
  const promptTextarea = document.getElementById('prompt-text');
  const toast = document.getElementById('success-toast');

  if (copyBtn && promptTextarea) {
    copyBtn.addEventListener('click', async () => {
      try {
        const textToCopy = promptTextarea.value;
        await navigator.clipboard.writeText(textToCopy);

        // Show Toast Notification
        if (toast) {
          toast.classList.add('show');
          
          // Hide after 2.5 seconds
          setTimeout(() => {
            toast.classList.remove('show');
          }, 2500);
        }
      } catch (err) {
        console.error('Failed to copy text: ', err);
        // Fallback for older browsers
        try {
          promptTextarea.select();
          document.execCommand('copy');
          if (toast) {
            toast.classList.add('show');
            setTimeout(() => {
              toast.classList.remove('show');
            }, 2500);
          }
        } catch (fallbackErr) {
          alert('Could not copy prompt automatically. Please select the text and copy manually.');
        }
      }
    });
  }

  // --- Search Input Auto-capitalization & Validation ---
  const searchInput = document.getElementById('search-keyword');
  const searchForm = document.getElementById('search-form');

  if (searchInput) {
    // Force uppercase and remove special characters/spaces during input
    searchInput.addEventListener('input', (e) => {
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      // Convert to uppercase and strip non-alphanumeric (except some characters if needed, but keywords are typically alphanumeric)
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
