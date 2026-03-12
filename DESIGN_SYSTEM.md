# Design System (Workspace-Style)

This app uses a token system in `src/app/globals.css` designed for a minimal Google Workspace-like UI language (Material 3 foundations + restrained product styling).

## Design Principles

- Minimal, information-first surfaces
- Consistent icon+label actions
- Teal accent in M3-style tonal roles
- Shared shell patterns across landing, setup, auth, and dashboard

## Token Workflow

- Make token updates in the `:root` block in `src/app/globals.css`.
- Prefer global token/class updates over one-off inline styling.

## Token Reference

### Colors
| Token | Usage |
|-------|--------|
| `--bg` | Page background |
| `--bg-soft` | Subtle background |
| `--surface` / `--card-bg` | Cards, panels |
| `--surface-container-*` | Tonal container layers |
| `--surface-soft` | Hover/secondary surface |
| `--foreground` / `--text` | Primary text |
| `--muted` | Secondary text |
| `--border` / `--border-soft` | Borders |
| `--accent` / `--accent-hover` | Primary actions |
| `--accent-soft` / `--accent-text` | Accent focus + links |
| `--accent-container` / `--accent-container-strong` | Tonal secondary actions |
| `--on-accent` / `--on-accent-container` | Text on accent surfaces |
| `--success`, `--danger`, `--warning`, `--caution` | Semantic + `-soft` variants |

### Spacing (4px base)
`--space-1` (4px) through `--space-16` (64px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

### Radius
`--radius-sm` (4px), `--radius` (8px), `--radius-md` (12px), `--radius-lg` (16px), `--radius-xl` (28px), `--radius-full`.

### Shadows
`--shadow-xs`, `--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-xl` with intentionally low-contrast elevation for Workspace-like restraint.

### Sidebar
`--sidebar-width` (260px), `--sidebar-bg`, `--sidebar-border`, `--sidebar-text`, `--sidebar-text-active`, `--sidebar-accent-bg`, `--sidebar-accent-text`.

## Components

- **Cards**: `.card`, `.card-flat`
- **Buttons**: `.btn`, `.btn.primary`, `.btn.secondary`, `.btn.danger`, `.btn-sm`, `.btn-xs`
- **Icon system**: `.material-symbols-rounded`, `.btn__icon`, `.sidebar-link__icon`
- **Forms**: `.field`, `.input`
- **Badges**: `.badge`, `.badge.success`, `.badge.danger`, `.badge.warning`, `.badge.accent`
- **Layout**: `.stack`, `.row`, `.grid`, `.container`, `.container-wide`
- **Shell**: `.top-app-bar`, `.dashboard-shell`, `.dashboard-main`, `.dashboard-main__inner`, `.sidebar`
- **Brand**: `.brand-mark`, `.product-wordmark`, `.product-subtitle`
- **Page**: `.page-header`, `.empty-state`

Typography uses `--font-sans` and `--font-mono` from the root layout (`Roboto`, `Roboto Mono`).

## Governance Rules

- Prefer global token/class updates over per-component inline style overrides.
- Use icon+label controls for primary actions to keep interaction patterns consistent.
- Keep gradients/glows subtle; avoid decorative effects that reduce Workspace-like clarity.
