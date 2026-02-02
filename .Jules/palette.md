# Palette's Journal

## 2025-05-23 - Initial Setup
**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility
**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-23 - Icon-Only Button Accessibility
**Learning:** Icon-only buttons using `title` attributes provide tooltips for mouse users but are often insufficient for screen readers. Explicit `aria-label` is required for full accessibility.
**Action:** When auditing icon-only buttons, ensure they have both `title` (or a Tooltip component) and `aria-label`.
