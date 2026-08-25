# ADR-0003: Use KendoReact for Data Components

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
We need production-grade data components: grids with virtual scrolling,
sortable/filterable/pageable tables, charts, date pickers, forms, and
a configurable dashboard tile layout. These must work well with React 19
and Next.js App Router.

## Decision
Use KendoReact for all data-heavy UI components.

## Rationale
- KendoReact Grid handles large datasets with virtual scrolling
- TileLayout provides drag-and-drop dashboard customisation per user
- Integrated export (Excel, PDF) out of the box
- Consistent theming across all components
- Actively maintained with first-class TypeScript support

## Alternatives Considered
- **AG Grid + custom components:** More work to integrate consistently; theming overhead
- **Tanstack Table:** Great for simple tables; no built-in TileLayout, charts, or export

## Consequences
- **Commercial license required** (~$1,899/dev/year for KendoReact)
- All KendoReact files must start with `"use client"`
- Theme customisation via CSS variables in `src/styles/payevo-kendo-theme.css`
