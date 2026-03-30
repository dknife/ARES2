// 로그 관리

import { elements } from './elements.js';

const MAX_COMPACT_LINES = 3;
const MAX_ENTRIES = 500;
const entries = [];

function isExpanded() {
    const container = elements.logContainer ?? document.getElementById('logContainer');
    return container?.classList.contains('expanded');
}

function render() {
    const expanded = isExpanded();
    const visible = expanded
        ? entries
        : entries.filter(e => !e.verbose).slice(-MAX_COMPACT_LINES);

    elements.logContent.innerHTML = '';

    for (const entry of visible) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${entry.type}`;

        const detailHtml = expanded && entry.detail
            ? `<div class="log-detail">${escapeHtml(entry.detail)}</div>`
            : '';

        logEntry.innerHTML = `
            <span class="log-timestamp">${entry.timestamp}</span>
            ${escapeHtml(entry.message)}
            ${detailHtml}
        `;

        elements.logContent.appendChild(logEntry);
    }

    if (expanded) {
        elements.logContent.scrollTop = elements.logContent.scrollHeight;
    }
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export const Logger = {
    add(message, type = 'info', options = {}) {
        const entry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
            type,
            verbose: !!options.verbose,
            detail: options.detail || ''
        };

        entries.push(entry);

        if (entries.length > MAX_ENTRIES) {
            entries.shift();
        }

        render();
    },

    clear() {
        entries.length = 0;
        elements.logContent.innerHTML = '';
    },

    refresh() {
        render();
    }
};
