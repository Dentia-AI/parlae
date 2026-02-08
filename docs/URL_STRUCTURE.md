# URL Structure Update

## Final URL Structure

All AI Agent related pages are now under `/home/agent/*`:

### Main Routes

| Route | Description |
|-------|-------------|
| `/home/agent` | AI Agents dashboard (main page) |
| `/home/agent/advanced` | Advanced setup (🔒 locked by default) |
| `/home/agent/phone-settings` | Phone integration settings |

### Setup Wizard Routes

| Route | Description |
|-------|-------------|
| `/home/agent/setup` | Wizard start (voice selection) |
| `/home/agent/setup/knowledge` | Knowledge base file upload |
| `/home/agent/setup/integrations` | Booking integrations (future) |
| `/home/agent/setup/phone` | Phone integration method selection |
| `/home/agent/setup/review` | Review and deploy |

### Navigation Structure

```
Setup (menu item)
├─ AI Agents (/home/agent)
└─ Advanced Setup (/home/agent/advanced) 🔒
```

## Directory Structure

```
app/home/(user)/agent/
├── page.tsx                    # Main AI Agents dashboard
├── layout.tsx                  # Shared layout
├── advanced/                   # Advanced setup (access controlled)
│   ├── page.tsx               # Server component with access check
│   └── _components/
│       └── advanced-setup-content.tsx
├── phone-settings/            # Phone integration settings
│   └── page.tsx
└── setup/                     # Setup wizard
    ├── page.tsx              # Voice selection
    ├── knowledge/
    │   └── page.tsx          # File upload
    ├── integrations/
    │   └── page.tsx          # Booking integrations
    ├── phone/
    │   └── page.tsx          # Phone method selection
    ├── review/
    │   └── page.tsx          # Review & deploy
    ├── _components/          # Shared wizard components
    └── _lib/                 # Actions & utilities
```

## Migration Summary

| Old URL | New URL |
|---------|---------|
| `/home/receptionist` | `/home/agent` |
| `/home/receptionist/setup` | `/home/agent/setup` |
| `/home/receptionist/setup/*` | `/home/agent/setup/*` |
| `/home/receptionist/advanced` | `/home/agent/advanced` |
| `/home/receptionist/phone-settings` | `/home/agent/phone-settings` |

## Benefits

1. **Cleaner URLs**: `agent/setup` instead of `setup/setup`
2. **Better semantics**: `/agent/*` clearly indicates AI agent features
3. **Scalability**: Easy to add more agent-related pages under `/agent/*`
4. **Consistency**: All agent features in one top-level directory
