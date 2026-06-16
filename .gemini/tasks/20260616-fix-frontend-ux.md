# Task: Fix Frontend UI/UX & Data Rendering Issues

## Checklist

- [x] Move SR dashboard counts statistics calculation from client-side local paging data to server-side database query.
- [x] Update `srs/page.tsx` to query global status statistics and pass them as props to `SRsDataTable`.
- [x] Update `SRsDataTable.tsx` to receive global counts as props.
- [x] Implement search query input debouncing in `SRsDataTable.tsx` to improve user typing search UX.
- [x] Run type-checks and verify UI functionality.
