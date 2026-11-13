// The Dental Space mark: a solid molar in the gingiva accent, set beside the name in one weight.
export function ToothMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.4 2.6C4.6 2.6 3 4.9 3 7.6c0 2.4.9 3.8 1.6 5.6.7 1.9.9 3.8 1.4 5.9.4 1.7 1.1 2.7 2.1 2.7 1.4 0 1.7-1.6 2-3.4.3-1.7.7-3.1 1.9-3.1s1.6 1.4 1.9 3.1c.3 1.8.6 3.4 2 3.4 1 0 1.7-1 2.1-2.7.5-2.1.7-4 1.4-5.9.7-1.8 1.6-3.2 1.6-5.6 0-2.7-1.6-5-4.4-5-1.9 0-3 1-4.6 1s-2.7-1-4.6-1Z"/></svg>;
}

export function BrandName() {
  return <><span className="brand-icon"><ToothMark /></span><span>Dentalspace</span></>;
}

// A clinic's uploaded logo. It is a small data URL already resized on upload, so next/image has nothing to optimise.
export function LogoImage({ src, className, alt = '' }: { src: string; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
