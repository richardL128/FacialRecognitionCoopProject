# Icons

The PayEvo Figma uses **Font Awesome (Pro)** — both Light/Outline and Solid weights. We can't ship FA Pro here, so the system uses **Lucide** (`https://unpkg.com/lucide@latest`) as a near-equivalent: same neutral geometry, ~1.5–2px stroke, no fills by default.

**Substitution flag — replace with Font Awesome Pro when license permits.**

## Mapping (FA → Lucide)

| Figma name | FA glyph | Lucide |
|---|---|---|
| BallotCheck | ballot-check | `clipboard-check` |
| BookLight | book | `book` |
| CalculatorLight | calculator | `calculator` |
| CircleDollar | circle-dollar | `circle-dollar-sign` |
| EllipsisHAlt | ellipsis-h | `more-horizontal` |
| FileAlt / FileLightV5 | file | `file-text` |
| FolderOpen | folder-open | `folder-open` |
| HandHoldingHeart1 | hand-holding-heart | `heart-handshake` |
| InfoSquareLight | info-square | `info` |
| MoneyBills | money-bills | `banknote` |
| NetworkWired | network-wired | `network` |
| Phone2 | phone | `phone` |
| Stopwatch1 | stopwatch | `timer` |
| TrashLight | trash | `trash-2` |
| UserLarge | user | `user` |
| ArrowLeft | arrow-left | `arrow-left` |
| PlusSolid | plus | `plus` |

## Rules

- Inherit `currentColor`. Default rest color: `#7987A9` (slate). Active: `#2285D0` (PE Blue). On primary buttons: `#FFFFFF`.
- 1.5px stroke at 14–18px; 2px stroke at 20px+.
- No emoji. No unicode glyph fallbacks.
