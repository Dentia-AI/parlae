# Adding Real Logos Guide

## Overview
This guide explains how to add real clinic and integration logos to replace the placeholder text.

## Step 1: Collect Logo Files

### For Trusted By Section (Quebec Clinics)
You'll need logos from major Quebec healthcare providers. Contact each clinic or download from their websites:

**Recommended clinics:**
1. Centre Dentaire Laval
2. Clinique Dentaire Montreal
3. Dentistes Rive-Sud
4. Clinique Dentaire Quebec
5. Centre Dentaire Longueuil
6. Clinique Dentaire Gatineau
7. Dentistes Sherbrooke
8. Centre Dentaire Trois-Rivières

**Logo requirements:**
- Format: PNG with transparent background (preferred) or SVG
- Size: At least 200x200px
- Quality: High resolution (2x for retina displays)
- File naming: `clinic-name.png` (e.g., `centre-dentaire-laval.png`)

### For Integrations Section (PMS Systems)
Download official logos from:

1. **Dentrix** - https://www.dentrix.com/media-kit
2. **Eaglesoft** - https://www.eaglesoft.net/
3. **Open Dental** - https://www.opendental.com/
4. **Curve** - https://www.curvedental.com/
5. **Sikka** - https://sikkasoft.com/
6. **CMS.gov** - https://www.cms.gov/
7. **UnitedHealthcare** - https://www.uhc.com/
8. **Aetna** - https://www.aetna.com/
9. **Cigna** - https://www.cigna.com/
10. **Humana** - https://www.humana.com/
11. **Medicaid** - Official state logos

**Logo requirements:**
- Format: PNG or SVG
- Size: 120x60px to 200x100px
- Aspect ratio: Maintain original
- Background: Transparent or white

## Step 2: Optimize Images

Before adding logos, optimize them:

```bash
# Install optimization tools
npm install -g imagemin-cli imagemin-pngquant

# Optimize PNG files
imagemin *.png --plugin=pngquant --out-dir=optimized

# Or use online tools:
# - https://tinypng.com/
# - https://squoosh.app/
```

## Step 3: Add Images to Project

1. **Create directories:**
```bash
mkdir -p apps/frontend/apps/web/public/images/clinics
mkdir -p apps/frontend/apps/web/public/images/integrations
mkdir -p apps/frontend/apps/web/public/images/insurance
```

2. **Copy logo files:**
```
apps/frontend/apps/web/public/images/
├── clinics/
│   ├── centre-dentaire-laval.png
│   ├── clinique-dentaire-montreal.png
│   ├── dentistes-rive-sud.png
│   └── ...
├── integrations/
│   ├── dentrix.png
│   ├── eaglesoft.png
│   ├── open-dental.png
│   └── ...
└── insurance/
    ├── united-healthcare.png
    ├── aetna.png
    ├── cigna.png
    └── ...
```

## Step 4: Update Trusted By Carousel

**File:** `apps/frontend/apps/web/app/(marketing)/_components/trusted-by-carousel.tsx`

```tsx
const QUEBEC_CLINICS = [
  { 
    name: 'Centre Dentaire Laval', 
    logo: '/images/clinics/centre-dentaire-laval.png' 
  },
  { 
    name: 'Clinique Dentaire Montreal', 
    logo: '/images/clinics/clinique-dentaire-montreal.png' 
  },
  { 
    name: 'Dentistes Rive-Sud', 
    logo: '/images/clinics/dentistes-rive-sud.png' 
  },
  { 
    name: 'Clinique Dentaire Quebec', 
    logo: '/images/clinics/clinique-dentaire-quebec.png' 
  },
  { 
    name: 'Centre Dentaire Longueuil', 
    logo: '/images/clinics/centre-dentaire-longueuil.png' 
  },
  { 
    name: 'Clinique Dentaire Gatineau', 
    logo: '/images/clinics/clinique-dentaire-gatineau.png' 
  },
  { 
    name: 'Dentistes Sherbrooke', 
    logo: '/images/clinics/dentistes-sherbrooke.png' 
  },
  { 
    name: 'Centre Dentaire Trois-Rivières', 
    logo: '/images/clinics/centre-dentaire-trois-rivieres.png' 
  },
];
```

## Step 5: Update Integrations Section

**File:** `apps/frontend/apps/web/app/(marketing)/_components/integrations-section.tsx`

```tsx
const INTEGRATIONS = [
  {
    name: 'Dentrix',
    description: 'Seamless integration with Dentrix PMS',
    logo: '/images/integrations/dentrix.png',
    status: 'available',
  },
  {
    name: 'Eaglesoft',
    description: 'Direct scheduling with Eaglesoft',
    logo: '/images/integrations/eaglesoft.png',
    status: 'available',
  },
  {
    name: 'Open Dental',
    description: 'Full sync with Open Dental',
    logo: '/images/integrations/open-dental.png',
    status: 'available',
  },
  {
    name: 'Curve',
    description: 'Real-time updates with Curve',
    logo: '/images/integrations/curve.png',
    status: 'available',
  },
  {
    name: 'Sikka',
    description: 'Complete Sikka integration',
    logo: '/images/integrations/sikka.png',
    status: 'available',
  },
  {
    name: 'More Coming',
    description: 'New integrations added monthly',
    logo: null,
    status: 'coming-soon',
  },
];
```

## Step 6: Update Insurance Logos in Animated Features

**File:** `apps/frontend/apps/web/app/(marketing)/_components/animated-features-section.tsx`

Find the insurance feature and update the logos array to use images:

```tsx
{
  id: 'insurance',
  icon: Shield,
  title: 'Real-Time Insurance Verification',
  description: 'Verify eligibility and benefits instantly during patient calls.',
  type: 'logos',
  logos: [
    { name: 'UnitedHealthcare', logo: '/images/insurance/united-healthcare.png' },
    { name: 'Aetna', logo: '/images/insurance/aetna.png' },
    { name: 'Cigna', logo: '/images/insurance/cigna.png' },
    { name: 'Humana', logo: '/images/insurance/humana.png' },
    { name: 'Medicaid', logo: '/images/insurance/medicaid.png' },
    { name: 'CMS.gov', logo: '/images/insurance/cms.png' },
  ],
  color: 'text-purple-500',
  bgColor: 'bg-purple-500/10',
}
```

Then update the LogosAnimation component:

```tsx
function LogosAnimation({ logos }: { logos: Array<{name: string, logo: string}> }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % logos.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [logos.length]);

  return (
    <div className="bg-muted/30 mt-4 rounded-lg p-4">
      <div className="grid grid-cols-3 gap-2">
        {logos.map((item, i) => (
          <div
            key={item.name}
            className={cn(
              'bg-background flex h-16 items-center justify-center rounded border p-2 transition-all duration-300',
              i === activeIndex ? 'border-primary scale-105 shadow-md' : 'border-border/50',
            )}
            style={{
              animation: i === activeIndex ? 'bob 1s ease-in-out infinite' : 'none',
            }}
          >
            <img 
              src={item.logo} 
              alt={item.name}
              className="h-full w-full object-contain opacity-70 transition-opacity hover:opacity-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 7: Add CSS Animation

Add to your global CSS or component:

```css
@keyframes bob {
  0%, 100% {
    transform: translateY(0) scale(1.05);
  }
  50% {
    transform: translateY(-10px) scale(1.05);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

Or use Tailwind animation in `tailwind.config.ts`:

```ts
module.exports = {
  theme: {
    extend: {
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0) scale(1.05)' },
          '50%': { transform: 'translateY(-10px) scale(1.05)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        bob: 'bob 1s ease-in-out infinite',
        slideIn: 'slideIn 0.3s ease-out',
      },
    },
  },
};
```

## Legal Considerations

### Trademark Usage
- **Get Permission**: Contact companies for permission to use their logos
- **Fair Use**: Educational/informational use may be covered
- **Attribution**: Consider adding "Trademarks belong to their respective owners"
- **Logo Guidelines**: Follow each company's brand guidelines

### Recommended Text
Add to footer:

```tsx
<p className="text-xs text-muted-foreground">
  All trademarks, logos and brand names are the property of their respective owners. 
  Use of these names, trademarks and brands does not imply endorsement.
</p>
```

## Fallback for Missing Logos

If you don't have a logo yet, keep the text fallback:

```tsx
{clinic.logo ? (
  <img
    src={clinic.logo}
    alt={clinic.name}
    className="h-12 object-contain opacity-70 transition-opacity hover:opacity-100"
  />
) : (
  <span className="text-muted-foreground px-4 text-center text-sm font-medium">
    {clinic.name}
  </span>
)}
```

## Testing Checklist

After adding logos:
- [ ] All images load correctly
- [ ] Images are properly sized
- [ ] Images have correct alt text
- [ ] Images are optimized (< 50KB each)
- [ ] Transparent backgrounds work with theme
- [ ] Images look good in dark mode
- [ ] Carousel animation works
- [ ] Bob animation works on hover
- [ ] Mobile view looks good

## Resources

### Free Logo Sources (Use Cautiously)
- Company websites (media/press kits)
- Official brand guidelines
- Clearbit Logo API: `https://logo.clearbit.com/{domain}`

### Logo Optimization Tools
- TinyPNG: https://tinypng.com/
- Squoosh: https://squoosh.app/
- ImageOptim: https://imageoptim.com/

### Next.js Image Component
For better performance, use Next.js Image:

```tsx
import Image from 'next/image';

<Image
  src={clinic.logo}
  alt={clinic.name}
  width={200}
  height={60}
  className="object-contain"
/>
```

---

**Note**: Make sure you have the legal right to use all logos. When in doubt, contact the company or use text-only versions.
