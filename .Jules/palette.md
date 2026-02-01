# Palette's Journal

## 2025-05-23 - Initial Setup
**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility
**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-24 - Accessible Select Controls
**Learning:** For `shadcn/ui` Select components used in dense UIs (like pagination) without a visible `<Label>`, the `aria-label` must be applied directly to the `SelectTrigger` component, not the root `Select` or `SelectValue`, to be correctly announced by screen readers.
**Action:** When using icon-only or standalone Selects, always add `aria-label` to `SelectTrigger`.
