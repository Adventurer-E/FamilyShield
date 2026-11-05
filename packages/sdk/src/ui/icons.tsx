import type { ReactNode } from 'react';

function Svg({ size = 20, stroke = 'currentColor', width = 2, children }: { size?: number; stroke?: string; width?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number; stroke?: string };

export const BackIcon = (p: P) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const CloseIcon = (p: P) => <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>;
export const ChevronIcon = (p: P) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const LockIcon = (p: P) => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
export const DocIcon = (p: P) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Svg>;
export const StarIcon = (p: P) => <Svg {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></Svg>;
export const CheckIcon = (p: P) => <Svg width={3} {...p}><path d="M20 6L9 17l-5-5" /></Svg>;
export const ShieldIcon = (p: P) => <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Svg>;
export const InfoIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const AlertIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></Svg>;
export const PeopleIcon = (p: P) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);
export const PauseIcon = (p: P) => <Svg {...p}><path d="M9 5v14M15 5v14" /></Svg>;
