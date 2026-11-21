import type {ProfileThemeId} from '../types.ts';

export interface ProfileThemeConfig {
  id: ProfileThemeId;
  label: string;
  gradientClass: string;
  borderClass: string;
  accentTextClass: string;
  pillClass: string;
  swatchHex: string;
}

export const PROFILE_THEMES: Record<ProfileThemeId, ProfileThemeConfig> = {
  'neon-pink': {
    id: 'neon-pink',
    label: 'Neón Rosa',
    gradientClass: 'from-[#2D1059] via-[#6B186F] to-[#3B0F5C]',
    borderClass: 'border-[#FF4D9D]/55',
    accentTextClass: 'text-[#FF88BE]',
    pillClass: 'bg-[#FF4D9D]/20 border-[#FF4D9D]/50 text-[#FFB5D8]',
    swatchHex: '#FF4D9D',
  },
  'cyber-blue': {
    id: 'cyber-blue',
    label: 'Ciber Azul',
    gradientClass: 'from-[#0D1E45] via-[#133A6E] to-[#1A1347]',
    borderClass: 'border-sky-400/55',
    accentTextClass: 'text-sky-300',
    pillClass: 'bg-sky-500/20 border-sky-400/50 text-sky-200',
    swatchHex: '#38BDF8',
  },
  'violet-pulse': {
    id: 'violet-pulse',
    label: 'Pulso Violeta',
    gradientClass: 'from-[#210D47] via-[#4C1D95] to-[#1E0B38]',
    borderClass: 'border-purple-400/55',
    accentTextClass: 'text-[#C084FC]',
    pillClass: 'bg-purple-500/20 border-purple-400/50 text-purple-200',
    swatchHex: '#A855F7',
  },
  'emerald-glow': {
    id: 'emerald-glow',
    label: 'Esmeralda Neón',
    gradientClass: 'from-[#0A2926] via-[#114B43] to-[#16123B]',
    borderClass: 'border-emerald-400/55',
    accentTextClass: 'text-emerald-300',
    pillClass: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
    swatchHex: '#34D399',
  },
  'amber-gold': {
    id: 'amber-gold',
    label: 'Dorado Solar',
    gradientClass: 'from-[#36200D] via-[#5E3213] to-[#2B103D]',
    borderClass: 'border-amber-400/55',
    accentTextClass: 'text-amber-300',
    pillClass: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
    swatchHex: '#FBBF24',
  },
};

export const PROFILE_THEME_LIST: ProfileThemeConfig[] = Object.values(PROFILE_THEMES);

export function getProfileTheme(theme?: ProfileThemeId | string | null): ProfileThemeConfig {
  if (theme && theme in PROFILE_THEMES) {
    return PROFILE_THEMES[theme as ProfileThemeId];
  }
  return PROFILE_THEMES['neon-pink'];
}

export function formatJoinDate(timestamp?: number, lang: 'es' | 'en' = 'es'): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}
