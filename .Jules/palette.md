# Palette's Journal

## 2025-05-23 - Initial Setup
**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility
**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-23 - Context-Aware Empty States
**Learning:** Generic "No data" messages in complex tables (like SR lists) are unhelpful. Users need to know *why* there is no data (e.g., active filters vs. truly empty). Providing a "Reset Filters" action directly in the empty state reduces friction significantly.
**Action:** When implementing empty states for filtered lists, always check for active filters and provide a direct action to clear them.
