# Design System (Pencil Design Kit Sync)

This app uses a **design-kit** token system in `src/app/globals.css`. The same tokens can be synced to **Pencil** (pencil.dev) via MCP so designs and code stay aligned.

## Using with Pencil Extension

1. Install the [Pencil extension](https://pencil.dev) in Cursor and have Pencil running.
2. **Open the design kit file**: Open `designs/htf-design-kit.pen` in Pencil. This file contains:
   - **Variables**: All design tokens (colors, spacing, radius, sidebar width) matching `globals.css`
   - **Reusable component**: `comp-sidebar` — the app sidebar (logo, Operations nav, Configuration nav, footer). Used via `ref` on every dashboard screen.
   - **Full UI suite** (one frame per screen, arranged in a grid):
     - **screen-sign-in** — Sign in (auth card, email/password, Sign in + Back to home)
     - **screen-sign-up** — Sign up (auth card, Create account)
     - **screen-dashboard-overview** — Dashboard home (metrics, Recent activity, Quick actions)
     - **screen-signals-risk** — Signals & Risk/Impact Analysis (internal/external cards, Risk assessment, Archive)
     - **screen-mitigation-plans** — Mitigation Plans (Current cases with approval-pending card, Archive)
     - **screen-agent-traces** — Autonomous Agent (run history card)
     - **screen-integrations** — Integrations (Input context + Execution zones)
     - **screen-autonomous** — Autonomous Agent (Automation level, Signal sources, Save / Run now)
     - **screen-company-profile** — Company Profile (form card)
     - **screen-playbook** — Memory (post-analysis)
3. To keep code and design in sync:
   - **From code → Pencil**: After changing tokens in `globals.css`, update the variables in `designs/htf-design-kit.pen` (same names: `color.bg`, `space.4`, `radius.lg`, etc.).
   - **From Pencil → code**: After changing variables in Pencil, copy the updated values back into the `:root` block in `globals.css`, or use Pencil MCP `set_variables` if available.

## Token Reference

### Colors
| Token | Usage |
|-------|--------|
| `--bg` | Page background |
| `--bg-soft` | Subtle background |
| `--surface` / `--card-bg` | Cards, panels |
| `--surface-soft` | Hover/secondary surface |
| `--foreground` / `--text` | Primary text |
| `--muted` | Secondary text |
| `--border` / `--border-soft` | Borders |
| `--accent` / `--accent-hover` | Primary actions |
| `--accent-soft` / `--accent-text` | Accent backgrounds, links |
| `--success`, `--danger`, `--warning`, `--caution` | Semantic + `-soft` variants |

### Spacing (4px base)
`--space-1` (4px) through `--space-16` (64px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

### Radius
`--radius-sm` (6px), `--radius` (8px), `--radius-md` (10px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-full`.

### Shadows
`--shadow-xs`, `--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-xl`.

### Sidebar
`--sidebar-width` (260px), `--sidebar-bg`, `--sidebar-border`, `--sidebar-text`, `--sidebar-text-active`, `--sidebar-accent-bg`, `--sidebar-accent-text`.

## Components

- **Cards**: `.card`, `.card-flat`
- **Buttons**: `.btn`, `.btn.primary`, `.btn.secondary`, `.btn.danger`, `.btn-sm`, `.btn-xs`
- **Forms**: `.field`, `.input`
- **Badges**: `.badge`, `.badge.success`, `.badge.danger`, `.badge.warning`, `.badge.accent`
- **Layout**: `.stack`, `.stack-xs/sm/lg/xl`, `.row`, `.grid`, `.grid.two/three/four`
- **Page**: `.page-header`, `.dashboard-shell`, `.sidebar`, `.empty-state`

Typography uses `--font-sans` and `--font-mono` from the root layout (Inter, JetBrains Mono).
