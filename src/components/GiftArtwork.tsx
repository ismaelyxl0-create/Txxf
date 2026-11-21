import {GIFT_BY_ID, type GiftSpriteCrop} from '../lib/gifts.ts';
import {SafeImage} from './TxlLogo.tsx';

export function GiftArtwork({
  giftId,
  imageUrl,
  spriteCrop,
  emoji,
  name,
  sizeClass = 'w-12 h-12',
  isShowcase = false,
}: {
  giftId?: string;
  imageUrl?: string;
  spriteCrop?: GiftSpriteCrop;
  emoji?: string;
  name?: string;
  sizeClass?: string;
  isShowcase?: boolean;
}) {
  const catalogItem = giftId ? GIFT_BY_ID[giftId] : undefined;
  const resolvedImageUrl = imageUrl ?? catalogItem?.imageUrl;
  const resolvedCrop = spriteCrop ?? catalogItem?.spriteCrop;
  const resolvedEmoji = emoji ?? catalogItem?.emoji ?? '🎁';
  const resolvedName = name ?? catalogItem?.name ?? 'Regalo 3D';
  const glowColor = catalogItem?.glowColor || '#EC4899';

  if (resolvedImageUrl && resolvedCrop) {
    const widthPct = (resolvedCrop.imgW / resolvedCrop.box) * 100;
    const heightPct = (resolvedCrop.imgH / resolvedCrop.box) * 100;
    const leftPct = -((resolvedCrop.cx - resolvedCrop.box / 2) / resolvedCrop.box) * 100;
    const topPct = -((resolvedCrop.cy - resolvedCrop.box / 2) / resolvedCrop.box) * 100;

    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-[#090412] shrink-0 select-none ${sizeClass}`}
        style={{
          boxShadow: isShowcase
            ? `0 20px 44px -8px ${glowColor}99, inset 0 1px 1px rgba(255,255,255,0.35)`
            : `0 8px 18px -6px ${glowColor}70, inset 0 1px 1px rgba(255,255,255,0.28)`,
          transform: isShowcase
            ? 'perspective(800px) rotateX(6deg) translateZ(16px)'
            : 'perspective(500px) rotateX(4deg)',
        }}
      >
        <img
          src={resolvedImageUrl}
          alt={resolvedName}
          draggable={false}
          style={{
            position: 'absolute',
            width: `${widthPct}%`,
            height: `${heightPct}%`,
            left: `${leftPct}%`,
            top: `${topPct}%`,
            maxWidth: 'none',
          }}
        />
        {/* 3D radial glossy rim + vignette */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.22) 0%, transparent 45%), radial-gradient(circle at 50% 50%, transparent 62%, rgba(9,4,18,0.65) 100%)',
          }}
        />
        {isShowcase && (
          <div
            aria-hidden="true"
            className="txl-shine-sweep absolute inset-0 pointer-events-none"
          />
        )}
      </div>
    );
  }

  if (resolvedImageUrl) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-[#090412] shrink-0 ${sizeClass}`}
        style={{
          boxShadow: isShowcase
            ? `0 20px 44px -8px ${glowColor}99, inset 0 1px 1px rgba(255,255,255,0.35)`
            : `0 8px 18px -6px ${glowColor}66`,
          transform: isShowcase ? 'perspective(800px) rotateX(6deg)' : 'perspective(500px) rotateX(4deg)',
        }}
      >
        <SafeImage
          src={resolvedImageUrl}
          alt={resolvedName}
          className="w-full h-full object-cover"
        />
        {isShowcase && (
          <div
            aria-hidden="true"
            className="txl-shine-sweep absolute inset-0 pointer-events-none"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#2C1654] to-[#130826] border border-white/15 shrink-0 ${sizeClass} ${
        isShowcase ? 'text-6xl' : 'text-2xl'
      }`}
      style={{
        boxShadow: isShowcase
          ? `0 18px 36px -6px ${glowColor}88`
          : `0 6px 14px -4px ${glowColor}55`,
      }}
      aria-hidden="true"
    >
      <span className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]">{resolvedEmoji}</span>
    </div>
  );
}
