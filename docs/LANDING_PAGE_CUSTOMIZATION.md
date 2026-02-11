# Landing Page Customization Guide

This guide explains how to customize the new landing page components.

## Quick Customization Checklist

### 1. Update Clinic Names in Carousel
**File**: `apps/frontend/apps/web/app/(marketing)/_components/trusted-by-carousel.tsx`

```tsx
const QUEBEC_CLINICS = [
  { name: 'Your Clinic Name 1', logo: null },
  { name: 'Your Clinic Name 2', logo: null },
  // Add more clinics...
];
```

**To add logos**:
1. Place logo images in `apps/frontend/apps/web/public/images/clinics/`
2. Update the array:
```tsx
{ name: 'Clinic Name', logo: '/images/clinics/clinic-name.png' }
```

### 2. Customize Features
**File**: `apps/frontend/apps/web/app/(marketing)/_components/features-section.tsx`

Edit the `FEATURES` array to change icons, titles, descriptions, or colors:

```tsx
{
  icon: Phone,  // Import from 'lucide-react'
  title: 'Your Feature Title',
  description: 'Your feature description',
  color: 'text-blue-500',      // Text color
  bgColor: 'bg-blue-500/10',   // Background color (with opacity)
}
```

### 3. Update Comparison Table
**File**: `apps/frontend/apps/web/app/(marketing)/_components/comparison-section.tsx`

Modify the `COMPARISON_DATA` array:

```tsx
{
  feature: 'Feature Name',
  traditional: 'Traditional service value',
  parlae: 'Parlae AI value',
  highlight: true,  // Set to true to highlight the row
}
```

### 4. Change Testimonials
**File**: `apps/frontend/apps/web/app/(marketing)/_components/testimonials-section.tsx`

Update the `TESTIMONIALS` array and stats:

```tsx
const TESTIMONIALS = [
  {
    name: 'Dr. Name',
    title: 'Position, Clinic Name',
    image: null,  // Add: '/images/testimonials/name.jpg'
    rating: 5,
    quote: "Your testimonial quote here.",
  },
];

// Update stats at the bottom:
<div className="text-primary mb-2 text-4xl font-bold">500+</div>
<div className="text-muted-foreground text-sm">
  Active Clinics
</div>
```

### 5. Modify Integrations
**File**: `apps/frontend/apps/web/app/(marketing)/_components/integrations-section.tsx`

Edit the `INTEGRATIONS` array:

```tsx
{
  name: 'Integration Name',
  description: 'Description',
  logo: null,  // Add: '/images/integrations/name.png'
  status: 'available',  // or 'coming-soon'
}
```

### 6. Update Hero Text
**File**: `apps/frontend/apps/web/app/(marketing)/page.tsx`

Change the main headline and subheadline:

```tsx
<h1 className="...">
  Your main headline
  <br />
  <span className="...">
    highlighted text
  </span>
</h1>

<p className="...">
  Your subheadline description text.
</p>
```

### 7. Customize Animation Colors
**File**: `apps/frontend/apps/web/app/(marketing)/_components/neural-wave-hero.tsx`

Adjust particle colors (line ~40):

```tsx
this.hue = 200 + Math.random() * 80; // Blue to purple range
// Change to:
this.hue = 180 + Math.random() * 60; // For different colors
```

Adjust gradient colors in style prop:

```tsx
style={{ 
  background: 'radial-gradient(circle at center, #0a0e1a 0%, #000000 100%)',
}}
```

### 8. Modify Animation Particle Count
**File**: `apps/frontend/apps/web/app/(marketing)/_components/neural-wave-hero.tsx`

Adjust performance vs visual quality (line ~26):

```tsx
const particleCount = 120;  // Increase for more particles, decrease for better performance
```

### 9. Change CTA Buttons
**File**: `apps/frontend/apps/web/app/(marketing)/page.tsx`

Update button text and links:

```tsx
<Link href={getAppUrl(pathsConfig.auth.signUp)}>
  <span className={'flex items-center space-x-2'}>
    <span>Your Button Text</span>
    <ArrowRightIcon className={'h-5 w-5'} />
  </span>
</Link>
```

### 10. Update Final CTA Section
**File**: `apps/frontend/apps/web/app/(marketing)/_components/final-cta-section.tsx`

Modify benefits list:

```tsx
const BENEFITS = [
  'Your benefit 1',
  'Your benefit 2',
  'Your benefit 3',
  'Your benefit 4',
];
```

Update trust indicators:

```tsx
<div className="text-primary mb-2 text-3xl font-bold">$50K+</div>
<div className="text-muted-foreground text-sm">
  Your metric description
</div>
```

## Color Scheme Customization

### Primary Colors
To change the primary blue/purple gradient theme:

1. **In Tailwind config** (if needed for new colors)
2. **In component files** - Replace color classes:
   - `text-primary` → `text-[your-color]`
   - `bg-primary` → `bg-[your-color]`
   - `border-primary` → `border-[your-color]`

### Common Color Patterns
- **Buttons**: `bg-primary hover:bg-primary/90`
- **Cards**: `border-primary/50 hover:border-primary/70`
- **Text**: `text-primary`
- **Backgrounds**: `bg-primary/5` or `bg-primary/10`

## Typography Customization

### Font Sizes
- Hero heading: `text-5xl md:text-7xl`
- Section headings: `text-4xl`
- Subheadings: `text-xl` or `text-2xl`
- Body text: `text-base` or `text-lg`

### Font Weights
- Bold headings: `font-bold`
- Semibold subheadings: `font-semibold`
- Medium buttons: `font-medium`
- Normal body: `font-normal`

## Responsive Design

All components use Tailwind's responsive prefixes:
- `sm:` - Small screens (640px+)
- `md:` - Medium screens (768px+)
- `lg:` - Large screens (1024px+)
- `xl:` - Extra large screens (1280px+)

Example:
```tsx
className="text-2xl md:text-4xl lg:text-5xl"
```

## Animation Customization

### Transition Durations
Default: `transition-all duration-300`

Options:
- Fast: `duration-150`
- Normal: `duration-300`
- Slow: `duration-500`

### Hover Effects
Common patterns:
```tsx
hover:scale-105       // Slight grow
hover:shadow-lg       // Add shadow
hover:border-primary  // Change border color
hover:bg-primary/10   // Background tint
```

## Adding New Sections

To add a new section:

1. **Create component file**:
```tsx
// _components/new-section.tsx
'use client';

export function NewSection() {
  return (
    <div className="container mx-auto px-4 py-24">
      {/* Your content */}
    </div>
  );
}
```

2. **Import in page.tsx**:
```tsx
import { NewSection } from './_components/new-section';
```

3. **Add to page**:
```tsx
<NewSection />
```

## Testing Changes

After making changes:

1. Save files
2. Check browser for visual updates
3. Test responsive design (resize browser)
4. Test on mobile device or dev tools
5. Verify animations are smooth
6. Check accessibility (keyboard navigation)

## Common Issues & Solutions

### Animation Performance
If animation is laggy:
- Reduce `particleCount` in neural-wave-hero.tsx
- Lower `particleCount` from 120 to 60-80

### Text Not Visible
If text is hard to read on dark background:
- Add text shadows: `className="drop-shadow-lg"`
- Increase contrast with lighter colors

### Components Not Aligned
- Check container classes: `container mx-auto`
- Verify padding: `px-4` or `px-8`
- Use flexbox: `flex justify-center items-center`

### Images Not Loading
- Verify file path: `/images/...`
- Check file exists in `public/images/`
- Use correct file extension (`.png`, `.jpg`, `.webp`)

## Advanced Customization

### Adding Animations
Use Tailwind's animation utilities:
```tsx
animate-pulse        // Pulsing effect
animate-bounce       // Bouncing effect
animate-spin         // Spinning effect
animate-fade-in-up   // Fade in from bottom
```

### Custom Gradients
```tsx
bg-gradient-to-r from-blue-500 to-purple-500  // Left to right
bg-gradient-to-br from-blue-500 to-purple-500 // Bottom-right diagonal
bg-gradient-to-t from-blue-500 to-purple-500  // Bottom to top
```

### Backdrop Effects
```tsx
backdrop-blur-sm     // Light blur
backdrop-blur-md     // Medium blur
backdrop-blur-lg     // Heavy blur
```

## Performance Best Practices

1. **Optimize images**: Use WebP format, compress images
2. **Lazy load**: Add `loading="lazy"` to images below fold
3. **Minimize animations**: Don't animate everything
4. **Use CSS over JS**: Prefer CSS transitions when possible
5. **Test on mobile**: Always check mobile performance

## Getting Help

If you need assistance:
1. Check the documentation in `/docs/LANDING_PAGE_REDESIGN.md`
2. Review the PatientDesk.ai website for design inspiration
3. Test changes incrementally
4. Use browser DevTools to inspect elements
