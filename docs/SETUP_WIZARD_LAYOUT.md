# Setup Wizard Layout Structure

## Visual Layout

```
┌─────────────────────────────────────────────────┐
│ Header (Fixed - flex-shrink-0)                  │
│ • Title                                         │
│ • Description                                   │
├─────────────────────────────────────────────────┤
│ Stepper (Fixed - flex-shrink-0)                 │
│ [1] → [2] → [3] → [4] → [5]                    │
├─────────────────────────────────────────────────┤
│                                                 │
│ Scrollable Content (flex-1, relative)           │
│ ┌───────────────────────────────────────────┐  │
│ │                                           │  │
│ │ (Absolute positioned, overflow-y-auto)    │  │
│ │                                           │  │
│ │ Card with form fields                     │  │
│ │ and content...                            │  │
│ │                                           │  │
│ │ ...scroll...                              │  │
│ │                                           │  │
│ │ More content...                           │  │
│ │                                           │◄─┼─ Scrollbar
│ └───────────────────────────────────────────┘  │
│ ╔═══════════════════════════════════════════╗  │
│ ║ Fade Gradient (pointer-events-none)       ║◄─┼─ Visual indicator
│ ╚═══════════════════════════════════════════╝  │
├─────────────────────────────────────────────────┤
│ Navigation Buttons (Fixed - flex-shrink-0)      │
│ [Back]                        [Continue/Next]   │
└─────────────────────────────────────────────────┘
```

## Key CSS Classes

### Container
```tsx
className="h-[calc(100vh-4rem)] flex flex-col"
```
- Fixed height calculated from viewport
- Flex column for vertical stacking
- Ensures content fits within viewport

### Fixed Sections (Header, Stepper, Navigation)
```tsx
className="flex-shrink-0"
```
- Prevents these sections from shrinking
- Always visible regardless of content

### Scrollable Area Container
```tsx
className="flex-1 relative min-h-0"
```
- `flex-1`: Takes remaining vertical space
- `relative`: Positioning context for absolute children
- `min-h-0`: Critical for proper flex behavior

### Scrollable Content
```tsx
className="absolute inset-0 overflow-y-auto"
```
- `absolute inset-0`: Fills parent container
- `overflow-y-auto`: Enables vertical scrolling

### Fade Gradient
```tsx
className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none"
```
- `absolute bottom-0`: Positioned at bottom
- `h-12`: 48px height (3rem)
- `bg-gradient-to-t`: Top-pointing gradient
- `from-background`: Fully opaque at bottom
- `via-background/80`: 80% opacity in middle
- `to-transparent`: Fully transparent at top
- `pointer-events-none`: Doesn't block interactions

## How It Works

1. **Container**: Fixed height ensures everything fits in viewport
2. **Fixed Elements**: Header, stepper, and navigation don't shrink
3. **Flex Space**: Scrollable area takes all remaining vertical space
4. **Absolute Scroll**: Content scrolls within its container
5. **Visual Cue**: Fade gradient indicates more content below
6. **Always Visible**: Navigation buttons always accessible

## Benefits

✅ Navigation buttons never hidden or require scrolling to reach
✅ User can always see their progress (stepper)
✅ Content scrolls smoothly within designated area
✅ Fade effect provides clear UX feedback
✅ Works consistently across all wizard steps
✅ Responsive to different viewport heights
✅ Professional, polished appearance

## Responsive Behavior

- **Tall screens**: More content visible, less scrolling needed
- **Short screens**: More scrolling required, but buttons always accessible
- **Mobile**: Same principles apply, optimized for smaller viewports
- **Fade effect**: Always indicates scrollable content regardless of device
