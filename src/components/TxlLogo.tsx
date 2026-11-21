import {useState} from 'react';
import {Image as ImageIcon} from 'lucide-react';
import type {BadgeTier} from '../types.ts';

export function TxlLogo({size = 32}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="txlHexGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9D4EDD" />
          <stop offset="100%" stopColor="#FF4D9D" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5L35 11.16V28.84L20 37.5L5 28.84V11.16L20 2.5Z"
        fill="url(#txlHexGrad)"
      />
      <rect x="11.5" y="16" width="2.6" height="8" rx="1.3" fill="#120824" />
      <rect x="16" y="11.5" width="2.6" height="17" rx="1.3" fill="#120824" />
      <rect x="20.5" y="14" width="2.6" height="12" rx="1.3" fill="#120824" />
      <rect x="25" y="16.5" width="2.6" height="7" rx="1.3" fill="#120824" />
    </svg>
  );
}

export function VerificationBadge({
  tier,
  verified,
  size = 16,
}: {
  tier?: BadgeTier;
  verified?: boolean;
  size?: number;
}) {
  const effective: BadgeTier = tier || (verified ? 'influencer' : 'none');
  if (effective === 'none') return null;

  const palette =
    effective === 'owner'
      ? {fill: '#0A0A0F', stroke: '#D4D4D8', label: 'Dueño Verificado'}
      : effective === 'moderator'
        ? {fill: '#2563EB', stroke: '#93C5FD', label: 'Moderador Verificado'}
        : {fill: '#E11D48', stroke: '#FDA4AF', label: 'Influencer Verificado'};

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={palette.label}
      className="shrink-0 inline-block"
    >
      <title>{palette.label}</title>
      <path
        d="M12 2.2L14.6 4.1L17.8 3.9L18.9 6.9L21.5 8.8L20.7 11.9L21.5 15L18.9 16.9L17.8 19.9L14.6 19.7L12 21.6L9.4 19.7L6.2 19.9L5.1 16.9L2.5 15L3.3 11.9L2.5 8.8L5.1 6.9L6.2 3.9L9.4 4.1L12 2.2Z"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12.2L10.9 14.6L15.8 9.5"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#2B1554] via-[#1C0E38] to-[#3A134B] text-[#B8A9D9] ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageIcon className="w-6 h-6 opacity-75" />
        {fallbackLabel && <span className="mt-1 text-xs font-medium px-2 text-center">{fallbackLabel}</span>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function getFrameClass(frame?: string): string {
  switch (frame) {
    case 'Pulso Neón':
      return 'ring-2 ring-[#FF4D9D] shadow-[0_0_24px_rgba(255,77,157,0.45)]';
    case 'Aurora Violeta':
      return 'ring-2 ring-[#8B5CF6] shadow-[0_0_24px_rgba(139,92,246,0.5)]';
    case 'Fuego Magenta':
      return 'ring-2 ring-[#F43F5E] shadow-[0_0_24px_rgba(244,63,94,0.45)]';
    default:
      return 'ring-1 ring-[#8B5CF6]/40';
  }
}

export function AvatarWithFrame({
  src,
  alt,
  frame,
  frameImageUrl,
  sizeClass = 'w-12 h-12',
  ringClass,
}: {
  src: string;
  alt: string;
  frame?: string;
  frameImageUrl?: string | null;
  sizeClass?: string;
  ringClass?: string;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeClass}`}>
      <SafeImage
        src={src}
        alt={alt}
        className={`w-full h-full rounded-full object-cover ${
          ringClass ?? (frameImageUrl ? '' : getFrameClass(frame))
        }`}
      />
      {frameImageUrl && (
        <img
          src={frameImageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute -inset-[14%] w-[128%] h-[128%] max-w-none object-contain pointer-events-none select-none z-10"
        />
      )}
    </div>
  );
}
