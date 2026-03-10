## 2025-03-10 - Adding keyboard support to SRListItem cards

**Learning:** Found that `SRListItem` cards acting as interactive navigational elements only supported mouse `onClick` events. Screen reader users and keyboard navigators couldn't easily access the detail view without relying on the internal link which only covered the title.
**Action:** Implemented `role="button"`, `tabIndex={0}`, `onKeyDown` with 'Enter'/'Space' support, `aria-label`, and `focus-visible` styles to ensure full keyboard accessibility for custom card components acting as links.
