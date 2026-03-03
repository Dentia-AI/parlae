import Link from 'next/link';
import Image from 'next/image';

import { cn } from '@kit/ui/utils';

function LogoImage({
  className,
}: {
  className?: string;
}) {
  return (
    <Image
      src="/images/parlae-logo.png"
      alt="Parlae"
      width={666}
      height={160}
      className={cn('w-[120px] lg:w-[140px] h-auto', className)}
      priority
      unoptimized
    />
  );
}

export function AppLogo({
  href,
  label,
  className,
}: {
  href?: string | null;
  className?: string;
  label?: string;
}) {
  if (href === null) {
    return <LogoImage className={className} />;
  }

  return (
    <Link aria-label={label ?? 'Home Page'} href={href ?? '/'} prefetch={true}>
      <LogoImage className={className} />
    </Link>
  );
}
