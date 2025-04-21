// public/script.js
const markdownInput = document.getElementById('markdownInput');
const convertToWordBtn = document.getElementById('convertToWordBtn');
const convertToPdfBtn = document.getElementById('convertToPdfBtn');
const statusMessageDiv = document.getElementById('statusMessage');
const clearBtn = document.getElementById('clearBtn');

// Store timeout IDs
let statusTimeoutId = null;

// --- UI Helper Functions ---

function setButtonLoading(button, isLoading) {
    const textSpan = button.querySelector('.button-text');
    const iconSpan = button.querySelector('.button-icon');
    const spinnerSpan = button.querySelector('.button-spinner');

    if (isLoading) {
        button.disabled = true;
        textSpan.style.display = 'none';
        iconSpan.style.display = 'none';
        spinnerSpan.style.display = 'inline-block'; // Show spinner
    } else {
        button.disabled = false;
        textSpan.style.display = 'inline-block';
        iconSpan.style.display = 'inline-block';
        spinnerSpan.style.display = 'none'; // Hide spinner
    }
}

function showStatus(message, type = 'processing', showIcon = true) {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);

    statusMessageDiv.innerHTML = ''; // Clear previous content
    statusMessageDiv.className = `status-area visible ${type}`; // Set classes

    let iconClass = '';
    if (showIcon) {
        switch (type) {
            case 'success': iconClass = 'fa-solid fa-check-circle'; break;
            case 'error': iconClass = 'fa-solid fa-times-circle'; break;
            case 'processing': iconClass = 'fa-solid fa-info-circle'; break; // Or another icon
        }
    }

    if (iconClass) {
        const icon = document.createElement('i');
        icon.className = iconClass;
        statusMessageDiv.appendChild(icon);
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    statusMessageDiv.appendChild(textSpan);
}

function hideStatus(delay = 0) {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);
    statusTimeoutId = setTimeout(() => {
        statusMessageDiv.className = 'status-area'; // Hide by removing 'visible'
        statusTimeoutId = null;
    }, delay);
}

// --- Core Conversion Logic ---

async function convertMarkdown(format, buttonElement) {
    const markdown = markdownInput.value.trim();
    if (!markdown) {
        showStatus('Oops! Please paste some Markdown first.', 'error');
        hideStatus(4000);
        return;
    }

    setButtonLoading(buttonElement, true); // Show loading state on the clicked button
    showStatus('Processing your request...', 'processing', false); // Simple processing message

    // Prepare payload
    const payload = { markdown: markdown };
    let formatName = 'Document'; // Generic name

    if (format === 'pdf') {
        formatName = 'PDF';
        // Get selected orientation
        const selectedOrientation = document.querySelector('input[name="pdfOrientation"]:checked').value;
        payload.orientation = selectedOrientation || 'portrait'; // Add orientation to payload
    } else if (format === 'docx') {
        formatName = 'Word';
    }

    try {
        const response = await fetch(`/convert/${format}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload), // Send payload with potential orientation
        });

        if (!response.ok) {
            let errorMsg = `Conversion failed. Server status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        // Handle successful file download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        const contentDisposition = response.headers.get('content-disposition');
        let filename = `MarkDraft_converted.${format}`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
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
        console.error(`Conversion Error (${formatName}):`, error);
        showStatus(`Error: ${error.message}`, 'error');
        // Keep error message visible longer or until next action
         hideStatus(8000); // Or remove auto-hide for errors
    } finally {
        setButtonLoading(buttonElement, false); // Hide loading state
    }
}

// --- Event Listeners ---

convertToWordBtn.addEventListener('click', (e) => convertMarkdown('docx', e.currentTarget));
convertToPdfBtn.addEventListener('click', (e) => convertMarkdown('pdf', e.currentTarget));

clearBtn.addEventListener('click', () => {
    markdownInput.value = '';
    hideStatus(100); // Hide any status quickly
    markdownInput.focus(); // Focus back on textarea
});

// Hide status if user starts typing again
markdownInput.addEventListener('input', () => {
    // Only hide if not currently processing (buttons enabled)
    if (!convertToWordBtn.disabled && !convertToPdfBtn.disabled) {
        hideStatus(100);
    }
});