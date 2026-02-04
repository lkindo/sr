# Palette's Journal

## 2025-05-23 - Initial Setup
**Learning:** This is a fresh start for Palette in this repo.
**Action:** Will document critical learnings here.

## 2025-05-23 - Context-Aware Accessibility
**Learning:** Even in an English-codebase (variable names, comments), if the UI text is in another language (Korean in this case), accessibility attributes like `aria-label` must match the UI language to ensure a consistent experience for screen reader users.
**Action:** Always check the surrounding UI text before deciding on the language for `aria-label` or `alt` text.

## 2025-05-24 - Context-Aware Empty States
**Learning:** "No data" is a discouraging empty state when a user has applied filters. A distinct "No search results" state with a clear "Reset Filters" action keeps the user in the flow and prevents dead ends.
**Action:** When implementing list views with filters, always verify that the empty state distinguishes between "empty collection" and "empty search results" and provides a way to reset.
