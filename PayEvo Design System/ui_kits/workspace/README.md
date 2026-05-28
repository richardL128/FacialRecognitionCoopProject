# PayEvo Workspace UI Kit

A high-fidelity recreation of the PayEvo Workspace product — the in-app payroll dashboard. Open `index.html` to interact.

## Components
- `Chrome.jsx` — TopHeader, Sidebar, Btn, Badge, HeroBand, Icon, PELogo, PEWordmark
- `Screens.jsx` — HomeScreen (dashboard), EmployeesScreen (list + filter + paginated table), ReportsScreen (cards), LoginScreen (split hero + form)

Click between sidebar items to flip between screens. Login is mocked — set `authed` to `false` in `App` to start at sign-in.

## Visual references (Figma)
- `/Workspace/section`, `/Workspace/Desktop`, `/Workspace/Default` — dashboard layouts
- `/Header/`, `/Navigation-Menu/Components` — chrome & nav active/hover patterns
- `/Buttons/Buttons-Guidelines` — button hierarchy
- `/Cards/Cards`, `/Cards/Apps-Preview` — surface card patterns
- `/Templates/Templates` — table + pagination layout
- `/Inputs/Inputs` — form field states

Icons: Lucide (substituting Font Awesome Pro). See `assets/icons/README.md`.
