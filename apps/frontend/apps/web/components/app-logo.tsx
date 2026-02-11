import Link from 'next/link';
import Image from 'next/image';

import { cn } from '@kit/ui/utils';

function LogoImage({
  className,
  width = 140,
  height = 40,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <Image
      src="/images/parlae-logo.svg"
      alt="Parlae AI"
      width={width}
      height={height}
      className={cn('w-[120px] lg:w-[140px] h-auto', className)}
      priority
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
