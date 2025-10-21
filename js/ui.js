/*
 * Chatooly UI Controls
 * Author: Yael Renous - Studio Video
 *
 * This file handles UI-specific functionality like collapsible sections,
 * control visibility toggles, and other interface interactions.
 *
 * 🤖 AI AGENTS: Put UI control logic here, NOT in main.js
 * - Collapsible sections
 * - Show/hide control groups
 * - Button interactions that don't affect canvas
 * - Form validation and UI state management
 */

// Setup collapsible sections
document.addEventListener('DOMContentLoaded', () => {
    // List of all collapsible sections
    const sections = [
        { header: 'model-header', content: 'model-section' },
        { header: 'transform-header', content: 'transform-section' },
        { header: 'hdri-header', content: 'hdri-section' },
        { header: 'animation-header', content: 'animation-section' },
        { header: 'background-header', content: 'background-section' }
    ];

    // Setup each section
    sections.forEach(({ header, content }) => {
        const headerEl = document.getElementById(header);
        const contentEl = document.getElementById(content);

        if (headerEl && contentEl) {
            headerEl.style.cursor = 'pointer';

            headerEl.addEventListener('click', () => {
                const isOpen = contentEl.style.display !== 'none';
                contentEl.style.display = isOpen ? 'none' : 'block';

                const toggle = headerEl.querySelector('.section-toggle');
                if (toggle) {
                    toggle.textContent = isOpen ? '▶' : '▼';
                }
            });
        }
    });
});
