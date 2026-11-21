import {Bell, CheckCheck, Heart, MessageCircle, ShieldCheck, Sparkles, UserPlus, Users} from 'lucide-react';
import {apiRequest, formatRelativeTime} from '../lib/api.ts';
import type {AlertItem, LanguageCode} from '../types.ts';

export function AlertsView({
  alerts,
  lang,
  onAlertsUpdated,
}: {
  alerts: AlertItem[];
  lang: LanguageCode;
  onAlertsUpdated: () => void;
}) {
  async function markAllRead() {
    await apiRequest('/api/alerts/read', {method: 'POST', body: {}});
    onAlertsUpdated();
  }

  async function markOneRead(id: string) {
    await apiRequest('/api/alerts/read', {method: 'POST', body: {id}});
    onAlertsUpdated();
  }

  function renderIcon(type: AlertItem['type']) {
    switch (type) {
      case 'follow':
        return <UserPlus className="w-4 h-4 text-[#FF4D9D]" />;
      case 'like':
        return <Heart className="w-4 h-4 text-[#FF4D9D]" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4 text-[#A78BFA]" />;
      case 'circle':
        return <Users className="w-4 h-4 text-[#A78BFA]" />;
      case 'bottle':
        return <Sparkles className="w-4 h-4 text-[#FF4D9D]" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-[#C084FC]" />;
    }
  }

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            {lang === 'es' ? 'Alertas' : 'Alerts'}
          </h1>
          <p className="text-sm text-[#B8A9D9] mt-1">
            {lang === 'es'
              ? 'Actividad reciente de tus círculos, publicaciones y botellas'
              : 'Recent activity across your circles, posts, and drifting bottles'}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="px-4 py-2.5 rounded-full text-xs font-medium bg-[#2B1554] border border-purple-400/30 text-[#E5DBFF] hover:bg-[#381C6D] flex items-center gap-2 min-h-[42px] cursor-pointer whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4 text-[#FF4D9D]" />
            <span>{lang === 'es' ? 'Marcar todo como leído' : 'Mark all as read'}</span>
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="txl-card rounded-3xl p-10 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-400/25 flex items-center justify-center mb-4">
            <Bell className="w-7 h-7 text-[#C084FC]" />
          </div>
          <h2 className="font-display text-lg font-semibold text-white">
            {lang === 'es' ? 'Sin alertas nuevas' : 'No new alerts'}
          </h2>
          <p className="text-sm text-[#B8A9D9] mt-1.5 max-w-sm">
            {lang === 'es'
              ? 'Cuando recibas seguidores, comentarios o respuestas a tus botellas aparecerán aquí.'
              : 'Followers, post comments, and drifting bottle replies will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => !alert.read && markOneRead(alert.id)}
              className={`w-full text-left txl-card rounded-2xl p-4 flex items-start gap-3.5 transition-colors cursor-pointer ${
                alert.read
                  ? 'opacity-75 hover:opacity-100'
                  : 'border-[#FF4D9D]/45 bg-[#2A144D]/85'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-[#160B2B] border border-purple-400/25 flex items-center justify-center shrink-0 mt-0.5">
                {renderIcon(alert.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-white truncate">{alert.title}</span>
                  <span className="text-xs text-[#9E8CC4] shrink-0 font-mono-num">
                    {formatRelativeTime(alert.createdAt, lang)}
                  </span>
                </div>
                <p className="text-sm text-[#C7B8E6] mt-1 leading-relaxed">{alert.body}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
