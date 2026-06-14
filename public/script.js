// public/script.js

// --- Element references ---
const markdownInput = document.getElementById('markdownInput');
const previewContent = document.getElementById('previewContent');
const convertToWordBtn = document.getElementById('convertToWordBtn');
const convertToPdfBtn = document.getElementById('convertToPdfBtn');
const statusMessageDiv = document.getElementById('statusMessage');
const clearBtn = document.getElementById('clearBtn');
const sampleBtn = document.getElementById('sampleBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const themeToggle = document.getElementById('themeToggle');
const wordCount = document.getElementById('wordCount');
const charCount = document.getElementById('charCount');
const editorGrid = document.querySelector('.editor-grid');
const viewTabs = document.querySelectorAll('.view-tab');

const PREVIEW_EMPTY_HTML = '<p class="preview-empty">Your formatted document will appear here.</p>';

const SAMPLE_MARKDOWN = `# Meeting Notes: Project Apollo

A quick demo of what MarkDraft can format.

## Summary

We're on track for the **Q3 launch**. Key risks are *staffing* and the
third-party API rate limits. See the [tracking issue](https://example.com) for
details.

## Action items

1. Finalize the onboarding flow
2. Write the migration script
3. Schedule the load test

- [x] Draft the spec
- [ ] Review with design
- [ ] Ship it

## Metrics

| Metric        | Last week | This week | Change |
| ------------- | --------- | --------- | ------ |
| Signups       | 1,204     | 1,488     | +23.6% |
| Active users  | 832       | 905       | +8.8%  |
| Churn         | 3.1%      | 2.7%      | -0.4pp |

## Notes

> Remember: the preview on the right is rendered by the **same engine** that
> generates your Word and PDF files, so what you see is what you get.

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

let statusTimeoutId = null;
let previewTimeoutId = null;

// --- Theme handling -------------------------------------------------------
// No explicit choice => follow the OS via the CSS prefers-color-scheme rules.
// A choice is stored in localStorage and forced via [data-theme] on <html>.
function effectiveTheme() {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark' || forced === 'light') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function refreshThemeIcon() {
  const isDark = effectiveTheme() === 'dark';
  themeToggle.innerHTML = isDark
    ? '<svg class="icon"><use href="#i-sun"></use></svg>'
    : '<svg class="icon"><use href="#i-moon"></use></svg>';
  themeToggle.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
}

function initTheme() {
  const saved = localStorage.getItem('markdraft-theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  refreshThemeIcon();

  // Keep the icon in sync with the OS when the user hasn't forced a theme.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) refreshThemeIcon();
  });
}

themeToggle.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('markdraft-theme', next);
  refreshThemeIcon();
});

// --- Editor stats & live preview -----------------------------------------
function updateStats() {
  const text = markdownInput.value;
  const chars = text.length;
  const words = (text.trim().match(/\S+/g) || []).length;
  wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
  charCount.textContent = `${chars.toLocaleString()} ${chars === 1 ? 'character' : 'characters'}`;
}

async function updatePreview() {
  const markdown = markdownInput.value;
  if (!markdown.trim()) {
    previewContent.innerHTML = PREVIEW_EMPTY_HTML;
    return;
  }
  try {
    const response = await fetch('/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown })
    });
    if (!response.ok) return; // Preview is best-effort; conversion still works.
    const data = await response.json();
    // data.html is sanitized server-side, so assigning it is safe.
    previewContent.innerHTML = data.html && data.html.trim() ? data.html : PREVIEW_EMPTY_HTML;
  } catch (error) {
    // network hiccup, just leave the current preview as-is
  }
}

function schedulePreview() {
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
  previewTimeoutId = setTimeout(updatePreview, 300);
}

// --- Status helpers -------------------------------------------------------
function setButtonLoading(button, isLoading) {
  const textSpan = button.querySelector('.button-text');
  const iconSpan = button.querySelector('.button-icon');
  const spinnerSpan = button.querySelector('.button-spinner');

  if (isLoading) {
    button.disabled = true;
    textSpan.style.display = 'none';
    iconSpan.style.display = 'none';
    spinnerSpan.style.display = 'inline-block';
  } else {
    button.disabled = false;
    textSpan.style.display = 'inline-block';
    iconSpan.style.display = 'inline-block';
    spinnerSpan.style.display = 'none';
  }
}

function showStatus(message, type = 'processing', showIcon = true) {
  if (statusTimeoutId) clearTimeout(statusTimeoutId);

  statusMessageDiv.innerHTML = '';
  statusMessageDiv.className = `status-area visible ${type}`;

  // Map status type to a sprite icon id (controlled values, safe for innerHTML).
  const iconId = { success: 'i-check', error: 'i-x', processing: 'i-info' }[type];
  if (showIcon && iconId) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'status-icon';
    iconWrap.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
    statusMessageDiv.appendChild(iconWrap);
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  statusMessageDiv.appendChild(textSpan);
}

function hideStatus(delay = 0) {
  if (statusTimeoutId) clearTimeout(statusTimeoutId);
  statusTimeoutId = setTimeout(() => {
    statusMessageDiv.className = 'status-area';
    statusTimeoutId = null;
  }, delay);
}

// --- Core conversion logic ------------------------------------------------
async function convertMarkdown(format, buttonElement) {
  const markdown = markdownInput.value.trim();
  if (!markdown) {
    showStatus('Please add some Markdown first.', 'error');
    hideStatus(4000);
    return;
  }

  setButtonLoading(buttonElement, true);
  showStatus('Processing your request...', 'processing', false);

  const payload = { markdown };
  let formatName = 'Document';

  if (format === 'pdf') {
    formatName = 'PDF';
    const selectedOrientation = document.querySelector('input[name="pdfOrientation"]:checked').value;
    payload.orientation = selectedOrientation || 'portrait';
  } else if (format === 'docx') {
    formatName = 'Word';
  }

  try {
    const response = await fetch(`/convert/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMsg = `Conversion failed. Server status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) { /* response wasn't JSON */ }
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;

    const contentDisposition = response.headers.get('content-disposition');
    let filename = `MarkDraft_converted.${format}`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      if (filenameMatch && filenameMatch.length > 1) filename = filenameMatch[1];
    }
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showStatus(`${formatName} generated successfully! Download starting.`, 'success');
    hideStatus(5000);
  } catch (error) {
    console.error(`Conversion error (${formatName}):`, error);
    showStatus(`Error: ${error.message}`, 'error');
    hideStatus(8000);
  } finally {
    setButtonLoading(buttonElement, false);
  }
}

// --- Event listeners ------------------------------------------------------
convertToWordBtn.addEventListener('click', (e) => convertMarkdown('docx', e.currentTarget));
convertToPdfBtn.addEventListener('click', (e) => convertMarkdown('pdf', e.currentTarget));

markdownInput.addEventListener('input', () => {
  updateStats();
  schedulePreview();
  if (!convertToWordBtn.disabled && !convertToPdfBtn.disabled) hideStatus(100);
});

clearBtn.addEventListener('click', () => {
  markdownInput.value = '';
  updateStats();
  previewContent.innerHTML = PREVIEW_EMPTY_HTML;
  hideStatus(100);
  markdownInput.focus();
});

sampleBtn.addEventListener('click', () => {
  markdownInput.value = SAMPLE_MARKDOWN;
  updateStats();
  updatePreview();
  markdownInput.focus();
  markdownInput.setSelectionRange(0, 0);
  markdownInput.scrollTop = 0;
});

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    markdownInput.value = typeof reader.result === 'string' ? reader.result : '';
    updateStats();
    updatePreview();
    showStatus(`Loaded "${file.name}".`, 'success');
    hideStatus(3000);
  };
  reader.onerror = () => {
    showStatus('Could not read that file.', 'error');
    hideStatus(4000);
  };
  reader.readAsText(file);
  fileInput.value = ''; // allow re-selecting the same file
});

// Mobile Edit/Preview tab switch
viewTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    viewTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.view === 'preview') {
      editorGrid.classList.add('show-preview');
      updatePreview();
    } else {
      editorGrid.classList.remove('show-preview');
    }
  });
});

// --- Init -----------------------------------------------------------------
initTheme();
updateStats();
