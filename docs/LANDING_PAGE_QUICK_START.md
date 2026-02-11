# Landing Page Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide will help you view and customize your new landing page.

## Step 1: View the Landing Page

### Start the Development Server
```bash
# From the project root
cd apps/frontend
npm run dev
```

### Open in Browser
Navigate to: **http://localhost:3000**

You should see:
- ✨ Animated neural wave background
- 📱 Responsive design
- 🎨 Modern, clean interface
- 🔄 Auto-rotating carousel

## Step 2: Make Your First Edit

### Update the Hero Heading

**File**: `apps/frontend/apps/web/app/(marketing)/page.tsx`

Find this section (around line 43):
```tsx
<h1 className="mb-6 mt-8 text-5xl font-bold tracking-tight text-white md:text-7xl">
  Never miss another
  <br />
  <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
    patient call
  </span>
</h1>
```

**Change it to:**
```tsx
<h1 className="mb-6 mt-8 text-5xl font-bold tracking-tight text-white md:text-7xl">
  Your New Headline
  <br />
  <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
    highlighted text
  </span>
</h1>
```

**Save the file** → Browser will auto-refresh!

## Step 3: Add Your Clinic Logos

### Update the Carousel

**File**: `apps/frontend/apps/web/app/(marketing)/_components/trusted-by-carousel.tsx`

1. **Add logos to your project:**
   ```
   apps/frontend/apps/web/public/images/clinics/
   ├── clinic1.png
   ├── clinic2.png
   └── clinic3.png
   ```

2. **Update the array:**
   ```tsx
   const QUEBEC_CLINICS = [
     { name: 'Your Clinic 1', logo: '/images/clinics/clinic1.png' },
     { name: 'Your Clinic 2', logo: '/images/clinics/clinic2.png' },
     { name: 'Your Clinic 3', logo: '/images/clinics/clinic3.png' },
   ];
   ```

3. **Save** → See your logos!

## Step 4: Customize Colors

### Change the Animation Colors

**File**: `apps/frontend/apps/web/app/(marketing)/_components/neural-wave-hero.tsx`

Find line ~40:
```tsx
this.hue = 200 + Math.random() * 80; // Blue to purple
```

**Change to:**
```tsx
this.hue = 150 + Math.random() * 60; // Green to blue
// or
this.hue = 300 + Math.random() * 60; // Pink to purple
```

### Change Button Colors

**File**: `apps/frontend/apps/web/app/(marketing)/page.tsx`

Find the CTAs (around line 152):
```tsx
<CtaButton className="h-12 px-8 text-base shadow-lg shadow-primary/50">
```

The `primary` color comes from your Tailwind config.

## Step 5: Update Your Content

### Quick Content Checklist

1. **Hero Section** (`page.tsx`)
   - [ ] Headline
   - [ ] Subheadline
   - [ ] CTA button text

2. **Trusted By** (`trusted-by-carousel.tsx`)
   - [ ] Clinic names
   - [ ] Clinic logos

3. **Features** (`features-section.tsx`)
   - [ ] Feature titles
   - [ ] Feature descriptions
   - [ ] Icons (from lucide-react)

4. **Testimonials** (`testimonials-section.tsx`)
   - [ ] Customer names
   - [ ] Quotes
   - [ ] Titles/positions
   - [ ] Statistics

5. **Pricing** (uses existing config)
   - Check: `apps/frontend/apps/web/config/billing.config.ts`

## Common Customizations

### 1. Change Animation Speed
**File**: `neural-wave-hero.tsx` (line ~33)
```tsx
this.speed = 0.0005 + Math.random() * 0.0015;
// Faster: multiply by 2
// Slower: multiply by 0.5
```

### 2. Add More Features
**File**: `features-section.tsx`
```tsx
{
  icon: YourIcon, // Import from 'lucide-react'
  title: 'New Feature',
  description: 'Feature description',
  color: 'text-green-500',
  bgColor: 'bg-green-500/10',
}
```

### 3. Update Comparison Table
**File**: `comparison-section.tsx`
```tsx
{
  feature: 'New Feature',
  traditional: 'Old way',
  parlae: 'New way',
  highlight: true,
}
```

### 4. Add Testimonial
**File**: `testimonials-section.tsx`
```tsx
{
  name: 'Dr. Name',
  title: 'Position, Company',
  image: '/images/testimonials/name.jpg',
  rating: 5,
  quote: "Testimonial quote here.",
}
```

## Project Structure

```
apps/frontend/apps/web/app/(marketing)/
├── _components/               # All landing page components
│   ├── neural-wave-hero.tsx
│   ├── trusted-by-carousel.tsx
│   ├── features-section.tsx
│   ├── how-it-works-section.tsx
│   ├── integrations-section.tsx
│   ├── testimonials-section.tsx
│   ├── comparison-section.tsx
│   └── final-cta-section.tsx
├── layout.tsx                 # Marketing layout
└── page.tsx                   # Main landing page
```

## Documentation

All documentation is in `/docs/`:

1. **LANDING_PAGE_REDESIGN.md**
   - Technical overview
   - Component details
   - Design decisions

2. **LANDING_PAGE_CUSTOMIZATION.md**
   - Detailed customization guide
   - All customization options
   - Code examples

3. **LANDING_PAGE_VISUAL_STRUCTURE.md**
   - Visual layout reference
   - Section breakdown
   - Spacing system

4. **LANDING_PAGE_TESTING_CHECKLIST.md**
   - Complete testing guide
   - Launch checklist
   - Monitoring setup

5. **LANDING_PAGE_IMPLEMENTATION_SUMMARY.md**
   - Complete implementation details
   - Success criteria
   - Version history

## Useful Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

## Keyboard Shortcuts

### VS Code
- `Cmd/Ctrl + P` - Quick file open
- `Cmd/Ctrl + Shift + F` - Search across files
- `Cmd/Ctrl + /` - Toggle comment
- `Cmd/Ctrl + D` - Select next occurrence

### Browser DevTools
- `Cmd/Ctrl + Shift + C` - Inspect element
- `Cmd/Ctrl + Shift + M` - Toggle device mode
- `F5` or `Cmd/Ctrl + R` - Refresh
- `Cmd/Ctrl + Shift + R` - Hard refresh

## Getting Help

### Check Console for Errors
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for red errors
4. Read error messages

### Common Issues

**Animation not showing?**
- Check browser console for errors
- Try hard refresh (Cmd/Ctrl + Shift + R)
- Verify canvas element exists

**Styles not applying?**
- Check Tailwind classes are correct
- Verify no typos in class names
- Try `npm run dev` restart

**Images not loading?**
- Verify path: `/images/...`
- Check file exists in `public/images/`
- Try different image format

**TypeScript errors?**
- Run `npm run type-check`
- Fix type issues
- Restart dev server

## Next Steps

1. ✅ View the page (http://localhost:3000)
2. ✅ Make a simple edit (change headline)
3. ✅ Add your clinic logos
4. ✅ Update testimonials
5. ✅ Customize colors
6. ✅ Test on mobile
7. ✅ Review documentation
8. ✅ Deploy to production

## Tips & Tricks

### Hot Reload
Changes auto-refresh in browser. If not working:
```bash
# Restart dev server
# Ctrl+C to stop
npm run dev
```

### Component Organization
- Each section = 1 component file
- Keep components small and focused
- Use TypeScript for type safety

### Styling Best Practices
- Use Tailwind utility classes
- Prefer semantic colors (`text-primary` vs `text-blue-500`)
- Use responsive prefixes (`sm:`, `md:`, `lg:`)
- Keep animations smooth (CSS over JS)

### Performance Tips
- Lazy load images below fold
- Optimize image sizes (WebP format)
- Minimize JavaScript bundle
- Use server components where possible

## Quick Reference

### Color Classes
```tsx
// Text colors
text-primary
text-secondary
text-muted-foreground

// Background colors
bg-background
bg-muted
bg-primary

// Border colors
border-border
border-primary
```

### Spacing Scale
```tsx
// Padding/Margin
p-4  // 1rem (16px)
p-6  // 1.5rem (24px)
p-8  // 2rem (32px)
p-12 // 3rem (48px)
p-24 // 6rem (96px)

// Gap
gap-4  // 1rem
gap-6  // 1.5rem
gap-8  // 2rem
```

### Responsive Breakpoints
```tsx
sm:   // 640px+
md:   // 768px+
lg:   // 1024px+
xl:   // 1280px+
2xl:  // 1536px+
```

## Support

Need help? Check:
1. Documentation in `/docs/`
2. Component code (well-commented)
3. Browser DevTools console
4. TypeScript errors in editor

---

**Ready to Build?** Start editing `page.tsx`!

**Need More Details?** See `LANDING_PAGE_CUSTOMIZATION.md`

**Questions?** Check the documentation or review component code.
