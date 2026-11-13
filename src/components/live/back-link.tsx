import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

// The way back to the list a page was opened from: a quiet chevron and the section name, above the page title.
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="back-link"><ChevronLeft size={16} aria-hidden /><span className="sr-only">Back to </span><span>{children}</span></Link>;
}
