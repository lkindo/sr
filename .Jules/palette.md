# Palette's Journal

## 2025-05-23 - Initial Setup

**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility

**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-23 - Focus for Hidden Inputs

**Learning:** File inputs that are visually hidden with `opacity: 0` can cause "Focus Indicator Failure" accessibility issues.
**Action:** Use `focus-within` on the parent container to provide a visual cue when the hidden input receives focus.

## 2025-05-23 - Context-Aware Empty States

**Learning:** Generic "No data" messages are frustrating when filters are applied. A context-aware empty state ("No search results") combined with a "Reset Filters" action significantly improves recovery from empty search results.
**Action:** Always check if filters are active before rendering an empty state in data tables or lists.
