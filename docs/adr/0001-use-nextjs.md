# ADR-0001: Use Next.js (App Router) as the Full-Stack Framework

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
We need a framework that handles both frontend UI and backend API,
keeps secrets (AI API keys, DB credentials) server-side only,
and supports SSR for performance on data-heavy pages.

## Decision
Use Next.js 16+ with App Router.

## Rationale
- API routes keep sensitive keys off the client
- Server Components for data-heavy tables (no client-side fetch waterfall)
- Single deployment unit — simpler for a small team
- Middleware layer for auth enforcement and kill switches at the route level
- `typedRoutes` option catches broken `href` props at build time

## Consequences
- KendoReact components require `"use client"` directive
- Team must understand Server vs Client Component boundary
- `noUncheckedIndexedAccess` tsconfig option requires array guards
