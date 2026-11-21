import {useState} from 'react';
import {Check, Copy, Download, ExternalLink, Share2, Smartphone, WifiOff, X} from 'lucide-react';
import {useOnlineStatus, usePWAInstall} from '../hooks/usePWAInstall.ts';
import type {LanguageCode} from '../types.ts';

export function OfflineIndicator({lang}: {lang: LanguageCode}) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 px-3.5 py-1.5 text-xs font-semibold text-[#110822] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>
        {lang === 'es'
          ? 'Sin conexión — usando caché local'
          : 'Offline mode — cached data active'}
      </span>
    </div>
  );
}

export function ShareAndInstallModal({
  open,
  onClose,
  shareUrl,
  shareTitle,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  shareTitle?: string;
  lang: LanguageCode;
}) {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  if (!open) return null;

  const title =
    shareTitle || 'Únete a TXLsocial — Salas de voz globales en vivo, círculos y perfiles neón';
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(`${title}\n${shareUrl}`);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShareFeedback(
        lang === 'es'
          ? 'Enlace copiado. Pégalo en Instagram, TikTok o cualquier red social.'
          : 'Link copied. Paste it into Instagram, TikTok, or any social app.'
      );
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setShareFeedback(shareUrl);
    }
  }

  async function handleNativeShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'TXLsocial',
          text: title,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    await handleCopy();
  }

  async function handleAndroidInstall() {
    const ok = await install();
    if (ok) {
      setShareFeedback('TXLsocial instalada en tu dispositivo.');
    }
  }

  const socialLinks = [
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodedText}`,
      color: 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/30',
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: 'bg-blue-500/20 border-blue-400/45 text-blue-200 hover:bg-blue-500/30',
    },
    {
      name: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodedUrl}`,
      color: 'bg-slate-500/25 border-slate-300/40 text-slate-100 hover:bg-slate-500/35',
    },
    {
      name: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}`,
      color: 'bg-sky-500/20 border-sky-400/45 text-sky-200 hover:bg-sky-500/30',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="txl-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF4D9D]/15 border border-[#FF4D9D]/45 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-[#FF4D9D]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                {lang === 'es' ? 'Compartir enlace y App Móvil' : 'Share Link & Mobile App'}
              </h2>
              <p className="text-xs text-[#B8A9D9]">
                Comparte TXLsocial en redes o instálala optimizada para Android e iPhone
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Copyable Universal Link */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#C4B5FD]">
            Enlace directo para compartir en cualquier país
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="txl-input flex-1 rounded-xl px-3.5 py-2.5 text-xs font-mono-num min-h-[44px]"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="txl-btn-primary rounded-xl px-4 py-2.5 text-xs font-semibold min-h-[44px] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        {/* Social Media Share Buttons */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-[#C4B5FD]">Compartir en redes sociales</p>
          <div className="grid grid-cols-2 gap-2.5">
            {socialLinks.map((net) => (
              <a
                key={net.name}
                href={net.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-2xl border px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between min-h-[44px] transition-colors ${net.color}`}
              >
                <span>{net.name}</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full rounded-2xl bg-[#1D1038] border border-purple-400/35 hover:border-[#FF4D9D]/60 px-4 py-3 text-xs font-semibold text-white flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-[#FF4D9D]" />
            <span>Compartir en Instagram, TikTok u otras apps</span>
          </button>
        </div>

        {shareFeedback && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-xs text-emerald-200">
            {shareFeedback}
          </div>
        )}

        {/* Mobile App / Android & iPhone Standalone Installer */}
        <div className="rounded-2xl bg-[#140A29] border border-purple-400/25 p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-[#38BDF8] shrink-0" />
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                App Móvil para Android e iPhone
              </h3>
              <p className="text-[11px] text-[#B8A9D9]">
                Instalación directa en pantalla de inicio como app nativa sin navegador
              </p>
            </div>
          </div>

          {isInstalled ? (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Ya estás usando TXLsocial en modo aplicación instalada.</span>
            </div>
          ) : (
            <div className="space-y-2.5 text-xs text-[#D8CCF4]">
              {isInstallable && (
                <button
                  type="button"
                  onClick={handleAndroidInstall}
                  className="txl-btn-primary w-full rounded-full py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar TXLsocial App (Android / Chrome)</span>
                </button>
              )}

              <div className="rounded-xl bg-[#1C0F36] border border-purple-400/20 p-3 space-y-1">
                <p className="font-semibold text-white">Android (estilo APK directo desde Chrome):</p>
                <p className="text-[11px] text-[#B8A9D9]">
                  Abre este enlace en Chrome → toca el menú <strong>⋮</strong> arriba a la derecha →
                  elige <strong>&quot;Instalar aplicación&quot;</strong> o{' '}
                  <strong>&quot;Agregar a pantalla principal&quot;</strong>. Se instala como icono de
                  app a pantalla completa.
                </p>
              </div>

              <div className="rounded-xl bg-[#1C0F36] border border-purple-400/20 p-3 space-y-1">
                <p className="font-semibold text-white">iPhone / iPad (Safari):</p>
                <p className="text-[11px] text-[#B8A9D9]">
                  Abre este enlace en Safari {isIOS ? '(tu dispositivo)' : ''} → toca el botón{' '}
                  <strong>Compartir</strong> en la barra inferior → elige{' '}
                  <strong>&quot;Agregar a inicio&quot;</strong>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
