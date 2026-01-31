# Palette's Journal

## 2025-05-23 - Initial Setup
**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility
**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-23 - Search Input UX
**Learning:** Adding a "Clear" button to search inputs is a high-value micro-interaction. It requires careful padding adjustment (e.g., `pr-10`) to prevent text overlap, and must be accessible (keyboard focusable, ARIA label).
**Action:** Always check inputs with icon buttons for proper padding and ensure the button is accessible.
