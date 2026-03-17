# Skill: KendoReact Patterns

## Critical Rule
ALL KendoReact components must have `"use client"` as the first line.

## Component Map
| Need                  | KendoReact Component              |
|-----------------------|-----------------------------------|
| Data tables           | Grid + GridColumn                 |
| Dashboard layout      | TileLayout                        |
| Charts                | Chart, ChartSeries                |
| Date pickers          | DatePicker, DateRangePicker       |
| Forms                 | Form, Field, FormElement          |
| Multi-step flows      | Stepper                           |
| Excel export          | ExcelExport (wrap around Grid)    |
| PDF export            | PDFExport                         |
| Notifications         | Notification, NotificationGroup   |
| Dropdowns             | DropDownList, MultiSelect         |

## Standard Grid Setup
```tsx
"use client";
import { Grid, GridColumn } from "@progress/kendo-react-grid";
import { process } from "@progress/kendo-data-query";

// Always use process() from kendo-data-query for sorting/filtering/paging
const result = process(data, dataState);
```

## Dashboard TileLayout — Save Per User
- On reposition: POST to `/api/dashboard/layout`
- On mount: GET from `/api/dashboard/layout`
- Default positions defined per role in `src/constants/dashboardLayouts.ts`

## Wrapper Pattern
Create thin wrappers in `src/components/kendo/` for app-wide consistent config:
```
src/components/kendo/
  AppGrid.tsx          ← standard grid with our defaults
  AppChart.tsx         ← standard chart with our theme
  AppDatePicker.tsx    ← with locale set appropriately
```

## Licensing
KendoReact requires a commercial license (~$1,899/dev/year).
Set the license key in your app — see KendoReact docs for `@progress/kendo-licensing`.
