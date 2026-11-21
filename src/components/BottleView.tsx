import {useEffect, useState} from 'react';
import {Clock, MessageSquarePlus, Send, Sparkles, X} from 'lucide-react';
import {apiRequest, formatRelativeTime} from '../lib/api.ts';
import type {BottleItem, LanguageCode} from '../types.ts';
import {GENERATED_ASSETS} from '../types.ts';
import {SafeImage} from './TxlLogo.tsx';

const MOODS = ['Nocturno', 'Confesión', 'Consejo', 'Música', 'Sueño'];

export function BottleView({lang}: {lang: LanguageCode}) {
  const [bottles, setBottles] = useState<BottleItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [throwOpen, setThrowOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState('Nocturno');
  const [throwing, setThrowing] = useState(false);

  const [caughtBottle, setCaughtBottle] = useState<BottleItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function loadBottles() {
    try {
      const res = await apiRequest<{bottles: BottleItem[]; activeCount: number}>('/api/bottles');
      setBottles(res.bottles);
      setActiveCount(res.activeCount);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBottles();
  }, []);

  async function handleThrow(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setThrowing(true);
    try {
      const res = await apiRequest<{bottle: BottleItem; activeCount: number}>('/api/bottles', {
        method: 'POST',
        body: {message: message.trim(), mood},
      });
      setBottles((prev) => [res.bottle, ...prev]);
      setActiveCount(res.activeCount);
      setMessage('');
      setThrowOpen(false);
      setFeedback('Tu botella fue lanzada al océano neón.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Error al lanzar botella');
    } finally {
      setThrowing(false);
    }
  }

  async function handleCollect() {
    setFeedback(null);
    try {
      const res = await apiRequest<{bottle: BottleItem}>('/api/bottles/collect', {
        method: 'POST',
      });
      setCaughtBottle(res.bottle);
      await loadBottles();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo recoger ninguna botella');
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!caughtBottle || !replyText.trim()) return;
    const res = await apiRequest<{reply: BottleItem['replies'][number]}>(
      `/api/bottles/${caughtBottle.id}/reply`,
      {
        method: 'POST',
        body: {message: replyText.trim()},
      }
    );
    setCaughtBottle((prev) =>
      prev ? {...prev, replies: [...prev.replies, res.reply], repliesCount: prev.repliesCount + 1} : null
    );
    setReplyText('');
    await loadBottles();
  }

  const visibleBottles = bottles.filter((b) => b.isMine || b.collected);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Hero Bottle Showcase (Screenshot 4) */}
        <div className="lg:col-span-6 flex flex-col items-center text-center">
          <h1 className="font-display text-3xl font-bold text-white">Drifting Bottle</h1>
          <p className="text-sm text-[#B8A9D9] mt-1 mb-5">
            {lang === 'es' ? 'Envía un mensaje anónimo al azar' : 'Send an anonymous message adrift'}
          </p>

          <div className="w-full max-w-[300px] sm:max-w-[330px] aspect-square rounded-3xl overflow-hidden border border-purple-400/25 shadow-2xl shadow-fuchsia-900/30">
            <SafeImage
              src={GENERATED_ASSETS.driftingBottleHero}
              alt="Botella neón flotando en el océano"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-[#C7B8E6] mt-4">
            <Clock className="w-4 h-4 text-[#C084FC]" />
            <span>
              {lang === 'es'
                ? 'Los mensajes se eliminan después de 24 horas'
                : 'Messages disappear after 24 hours'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full max-w-md mt-5">
            <button
              type="button"
              onClick={() => setThrowOpen(true)}
              className="txl-btn-primary rounded-full py-3.5 px-4 text-sm font-semibold min-h-[48px] cursor-pointer whitespace-nowrap"
            >
              {lang === 'es' ? 'Lanzar botella' : 'Throw bottle'}
            </button>
            <button
              type="button"
              onClick={handleCollect}
              className="rounded-full py-3.5 px-4 text-sm font-semibold min-h-[48px] border border-[#FF4D9D] text-white bg-[#170A2B] hover:bg-[#FF4D9D]/15 transition-colors cursor-pointer whitespace-nowrap"
            >
              {lang === 'es' ? 'Recoger botella' : 'Pick up bottle'}
            </button>
          </div>

          {feedback && (
            <p className="mt-3 text-xs text-[#FF88BE] font-medium" role="status">
              {feedback}
            </p>
          )}
        </div>

        {/* Active Ocean Bottles */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-white">
              {lang === 'es' ? 'Botellas activas en el océano' : 'Active bottles in the ocean'}
            </h2>
            <span className="text-xs text-[#C7B8E6] font-mono-num">
              {activeCount} {lang === 'es' ? 'activas' : 'active'}
            </span>
          </div>

          {loading ? (
            <div className="txl-card rounded-3xl p-8 text-center text-sm text-[#B8A9D9]">
              Explorando el océano neón...
            </div>
          ) : visibleBottles.length === 0 ? (
            <div className="txl-card rounded-3xl p-8 text-center flex flex-col items-center">
              <h3 className="font-display text-base font-bold text-white">
                {activeCount === 0
                  ? 'El océano neón está vacío'
                  : 'Tienes botellas esperando en el océano'}
              </h3>
              <p className="text-sm text-[#B8A9D9] mt-1.5 max-w-sm">
                {activeCount === 0
                  ? 'Aún no hay mensajes anónimos reales. ¡Lanza la primera botella!'
                  : 'Toca "Recoger botella" para pescar un mensaje anónimo al azar.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleBottles.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setCaughtBottle(b)}
                  className="w-full text-left txl-card rounded-2xl p-4 hover:border-[#FF4D9D]/50 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#B8A9D9]">
                    <span className="flex items-center gap-1.5 text-[#FF88BE] font-medium">
                      <Sparkles className="w-3.5 h-3.5" />
                      {b.isMine ? 'Tu botella lanzada' : 'Botella recogida'} · {b.mood}
                    </span>
                    <span className="font-mono-num">
                      {formatRelativeTime(b.createdAt, lang)} · {b.repliesCount} resp.
                    </span>
                  </div>
                  <p className="text-sm text-white line-clamp-2">{b.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Throw Bottle Modal */}
      {throwOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Lanzar botella al mar</h2>
              <button
                type="button"
                onClick={() => setThrowOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleThrow} className="space-y-4">
              <div>
                <p className="text-xs text-[#C7B8E6] mb-2">Vibra del mensaje</p>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMood(m)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] cursor-pointer ${
                        mood === m
                          ? 'bg-[#A855F7] text-white'
                          : 'bg-[#190C30] border border-purple-400/25 text-[#CBBCEB]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe un pensamiento anónimo, consejo o saludo nocturno..."
                rows={4}
                required
                minLength={3}
                maxLength={400}
                className="txl-input w-full rounded-2xl p-4 text-sm resize-none"
              />

              <button
                type="submit"
                disabled={throwing || message.trim().length < 3}
                className="txl-btn-primary w-full rounded-full py-3.5 text-sm font-semibold min-h-[48px] disabled:opacity-50 cursor-pointer"
              >
                {throwing ? 'Lanzando...' : 'Soltar al océano neón'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Inspect & Reply to Bottle Modal */}
      {caughtBottle && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="w-5 h-5 text-[#FF4D9D]" />
                <h2 className="font-display text-lg font-bold text-white">
                  Mensaje en la botella · {caughtBottle.mood}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCaughtBottle(null)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#140A29] border border-purple-400/25 p-4 text-sm text-white leading-relaxed">
              {caughtBottle.message}
            </div>

            {caughtBottle.replies.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#B8A9D9]">Respuestas anónimas</p>
                {caughtBottle.replies.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl bg-[#1E103A] border border-purple-400/20 px-3.5 py-2.5 text-xs text-[#E9DFFF]"
                  >
                    <p>{r.message}</p>
                    <span className="text-[11px] text-[#8E7CB5] block mt-1">
                      {formatRelativeTime(r.createdAt, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleReply} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Responder anónimamente..."
                maxLength={280}
                className="txl-input flex-1 rounded-full px-4 py-2.5 text-sm min-h-[44px]"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                aria-label="Enviar respuesta"
                className="txl-btn-primary w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
