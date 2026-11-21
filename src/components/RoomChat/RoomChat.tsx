import {useEffect, useRef, useState} from 'react';
import {
  Coins,
  Gift,
  ImagePlus,
  Mic,
  Plus,
  Send,
  Shield,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {apiRequest, formatRelativeTime, readStickerOrGifFile} from '../../lib/api.ts';
import type {CircleMessage, CustomStickerItem, LanguageCode} from '../../types.ts';
import {BUILTIN_GIFS, CUSTOM_TXL_EMOJIS, GIFT_ITEMS} from '../../types.ts';
import {GiftArtwork} from '../GiftArtwork.tsx';
import {SafeImage, VerificationBadge} from '../TxlLogo.tsx';
import {StickerCreatorModal} from './StickerCreatorModal.tsx';

export interface RoomChatProps {
  messages: CircleMessage[];
  currentUserId: string;
  userCoins: number;
  infiniteCoins?: boolean;
  canModerate: boolean;
  lang: LanguageCode;
  recordingNote: boolean;
  recordingSeconds: number;
  sendingMsg: boolean;
  onSendText: (text: string) => Promise<void> | void;
  onSendMedia: (payload: {
    kind: 'sticker' | 'gif';
    mediaUrl: string;
    content: string;
  }) => Promise<void> | void;
  onReactMessage: (msgId: string, emoji: string) => Promise<void> | void;
  onSendGift: (giftId: string) => Promise<void> | void;
  onDeleteMessage: (msgId: string) => Promise<void> | void;
  onToggleVoiceNote: () => void;
}

const GIFT_CATEGORIES = [
  'Todos',
  'Especial 3D',
  'Lujo VIP',
  'Mascotas 3D',
  'Amor 3D',
  'Fiesta 3D',
  'Deporte',
  'Cultura',
  'País',
  'Clásico',
] as const;

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👏', '🚀'];

export function RoomChat({
  messages,
  currentUserId,
  userCoins,
  infiniteCoins = false,
  canModerate,
  lang,
  recordingNote,
  recordingSeconds,
  sendingMsg,
  onSendText,
  onSendMedia,
  onReactMessage,
  onSendGift,
  onDeleteMessage,
  onToggleVoiceNote,
}: RoomChatProps) {
  const [chatText, setChatText] = useState('');
  const [giftSelectorOpen, setGiftSelectorOpen] = useState(false);
  const [mediaDrawerOpen, setMediaDrawerOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<'emojis' | 'gifs' | 'stickers'>('emojis');
  const [stickerCreatorOpen, setStickerCreatorOpen] = useState(false);
  const [customStickers, setCustomStickers] = useState<CustomStickerItem[]>([]);
  const [giftCategory, setGiftCategory] = useState<string>('Todos');
  const [sendingGiftId, setSendingGiftId] = useState<string | null>(null);
  const [openReactMsgId, setOpenReactMsgId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const gifUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, [messages.length]);

  useEffect(() => {
    apiRequest<{stickers: CustomStickerItem[]}>('/api/stickers')
      .then((res) => setCustomStickers(res.stickers))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    setChatText('');
    await onSendText(trimmed);
  }

  async function handlePickGift(giftId: string) {
    setSendingGiftId(giftId);
    try {
      await onSendGift(giftId);
      setGiftSelectorOpen(false);
    } finally {
      setSendingGiftId(null);
    }
  }

  async function handlePickGifFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaError(null);
    try {
      const dataUrl = await readStickerOrGifFile(file, 360);
      await onSendMedia({
        kind: 'gif',
        mediaUrl: dataUrl,
        content: file.name.replace(/\.(gif|webp|png|jpg)$/i, '').slice(0, 32) || 'GIF',
      });
      setMediaDrawerOpen(false);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'No se pudo enviar el GIF');
    }
  }

  async function handleDeleteSticker(stickerId: string) {
    try {
      await apiRequest(`/api/stickers/${stickerId}`, {method: 'DELETE'});
      setCustomStickers((prev) => prev.filter((s) => s.id !== stickerId));
    } catch {
      // ignore
    }
  }

  const filteredGifts =
    giftCategory === 'Todos'
      ? GIFT_ITEMS
      : GIFT_ITEMS.filter((g) => g.category === giftCategory);

  const customEmojis = customStickers.filter((s) => s.kind === 'emoji');
  const userStickers = customStickers.filter((s) => s.kind === 'sticker');

  return (
    <div className="flex flex-col flex-1 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">
          {lang === 'es' ? 'Chat en vivo de la sala' : 'Live room chat'}
        </h2>
        <span className="text-xs text-[#A998CC] font-mono-num">
          {messages.length} {lang === 'es' ? 'mensajes' : 'messages'}
        </span>
      </div>

      {/* Lista de mensajes: texto, regalos, notas de voz, GIFs, stickers y reacciones libres */}
      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="txl-card rounded-2xl p-6 text-center text-sm text-[#B8A9D9]">
            {lang === 'es'
              ? 'Envía un mensaje, nota de voz, GIF, sticker personalizado o regalo.'
              : 'Send a message, voice note, GIF, custom sticker, or gift.'}
          </div>
        ) : (
          messages.map((msg) => {
            const canDelete = msg.authorId === currentUserId || canModerate;
            const reactionEntries = Object.entries(msg.reactions || {}).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );

            return (
              <div
                key={msg.id}
                className="txl-card rounded-2xl p-3.5 flex items-start gap-3"
              >
                <SafeImage
                  src={msg.authorAvatar}
                  alt={msg.authorName}
                  className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-purple-400/50"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-semibold text-sm text-white truncate">
                        {msg.authorName}
                      </span>
                      <VerificationBadge
                        tier={msg.authorBadgeTier}
                        verified={msg.authorVerified}
                        size={14}
                      />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          msg.authorRole === 'Admin'
                            ? 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                            : msg.authorRole === 'Mod'
                              ? 'bg-purple-500/20 border-purple-400/45 text-purple-200'
                              : 'bg-white/5 border-purple-400/20 text-[#C4B5FD]'
                        }`}
                      >
                        {msg.authorRole === 'Admin' && (
                          <Shield className="w-2.5 h-2.5 text-amber-300" />
                        )}
                        <span>{msg.authorRole}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-[#9E8CC4]">
                        {formatRelativeTime(msg.createdAt, lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenReactMsgId((prev) => (prev === msg.id ? null : msg.id))
                        }
                        aria-label="Reaccionar al mensaje"
                        className="text-[#9E8CC4] hover:text-[#FF4D9D] cursor-pointer p-1 rounded-lg"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void onDeleteMessage(msg.id)}
                          aria-label={lang === 'es' ? 'Eliminar mensaje' : 'Delete message'}
                          className="text-[#9E8CC4] hover:text-rose-300 cursor-pointer p-1 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {msg.kind === 'gift' ? (
                    <div className="mt-2 rounded-2xl bg-[#2D1D24]/85 border border-amber-400/65 p-3 flex items-center gap-3">
                      <GiftArtwork
                        giftId={msg.giftId}
                        imageUrl={msg.giftImageUrl}
                        emoji={msg.giftEmoji}
                        name={msg.giftName}
                        sizeClass="w-12 h-12"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white">{msg.giftName}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 font-mono-num">
                            <Coins className="w-3.5 h-3.5" />
                            {(msg.giftCoins || 0).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-[#E9DFFF] mt-0.5">{msg.content}</p>
                      </div>
                    </div>
                  ) : msg.kind === 'audio' && msg.audioUrl ? (
                    <div className="mt-2 rounded-2xl bg-[#160B2B] border border-purple-400/25 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-[#C4B5FD]">
                        <Volume2 className="w-3.5 h-3.5 text-[#FF4D9D]" />
                        <span>{msg.content}</span>
                      </div>
                      <audio controls src={msg.audioUrl} className="w-full h-8" />
                    </div>
                  ) : (msg.kind === 'sticker' || msg.kind === 'gif') && msg.mediaUrl ? (
                    <div className="mt-2 inline-flex flex-col items-start gap-1">
                      <div className="rounded-2xl bg-[#150A28] border border-purple-400/25 p-2">
                        <img
                          src={msg.mediaUrl}
                          alt={msg.content || msg.kind}
                          className={`rounded-xl object-contain ${
                            msg.kind === 'gif' ? 'w-28 h-28' : 'w-24 h-24'
                          }`}
                        />
                      </div>
                      {msg.content && (
                        <span className="text-[10px] text-[#9E8CC4]">{msg.content}</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#EFEAFF] mt-1 break-words">{msg.content}</p>
                  )}

                  {/* Quick open reaction bar */}
                  {openReactMsgId === msg.id && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#130826] border border-purple-400/35 px-2 py-1">
                      {QUICK_REACTIONS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            setOpenReactMsgId(null);
                            void onReactMessage(msg.id, em);
                          }}
                          className="w-7 h-7 rounded-full hover:bg-white/10 text-base flex items-center justify-center cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Existing reactions (anyone can react freely!) */}
                  {reactionEntries.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {reactionEntries.map(([emoji, userIds]) => {
                        const reactedByMe = userIds.includes(currentUserId);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => void onReactMessage(msg.id, emoji)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                              reactedByMe
                                ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                                : 'bg-[#170A2B] border-purple-400/25 text-[#D8CCF4]'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-mono-num">{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* Selector de Emojis Personalizados, GIFs y Stickers Creados */}
      {mediaDrawerOpen && (
        <div className="rounded-2xl bg-[#1B0E35] border border-purple-400/45 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  {id: 'emojis', label: 'Emojis'},
                  {id: 'gifs', label: 'GIFs'},
                  {id: 'stickers', label: `Stickers (${userStickers.length})`},
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMediaTab(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    mediaTab === t.id
                      ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white'
                      : 'bg-[#130926] border border-purple-400/25 text-[#C4B5FD]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMediaDrawerOpen(false)}
              aria-label="Cerrar panel de emojis, GIFs y stickers"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B8A9D9] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {mediaError && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-3 py-2 text-xs text-rose-200">
              {mediaError}
            </div>
          )}

          {mediaTab === 'emojis' && (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              <div className="grid grid-cols-8 gap-1.5">
                {CUSTOM_TXL_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setChatText((prev) => `${prev}${em}`)}
                    className="h-9 rounded-xl bg-[#130926] hover:bg-purple-500/25 text-lg flex items-center justify-center cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-purple-500/20">
                <span className="text-[11px] font-semibold text-[#C4B5FD]">
                  Emojis personalizados creados ({customEmojis.length})
                </span>
                <button
                  type="button"
                  onClick={() => setStickerCreatorOpen(true)}
                  className="text-[11px] font-semibold text-[#FF88BE] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear emoji / sticker</span>
                </button>
              </div>

              {customEmojis.length > 0 && (
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {customEmojis.map((ce) => (
                    <button
                      key={ce.id}
                      type="button"
                      onClick={() => {
                        void onSendMedia({
                          kind: 'sticker',
                          mediaUrl: ce.imageUrl,
                          content: ce.name,
                        });
                        setMediaDrawerOpen(false);
                      }}
                      className="rounded-xl bg-[#130926] border border-purple-400/25 hover:border-[#EC4899] p-1.5 flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <img src={ce.imageUrl} alt={ce.name} className="w-9 h-9 object-contain" />
                      <span className="text-[10px] text-[#D8CCF4] truncate max-w-full">
                        {ce.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mediaTab === 'gifs' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {BUILTIN_GIFS.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => {
                      void onSendMedia({
                        kind: 'gif',
                        mediaUrl: gif.url,
                        content: gif.name,
                      });
                      setMediaDrawerOpen(false);
                    }}
                    className="rounded-xl bg-[#130926] border border-purple-400/25 hover:border-[#EC4899] p-2 flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <img
                      src={gif.url}
                      alt={gif.name}
                      className="w-14 h-14 rounded-lg object-contain"
                    />
                    <span className="text-[10px] text-white truncate max-w-full">
                      {gif.name}
                    </span>
                  </button>
                ))}
              </div>

              <input
                ref={gifUploadRef}
                type="file"
                accept="image/gif,image/webp"
                onChange={handlePickGifFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => gifUploadRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed border-cyan-400/50 bg-cyan-500/10 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Subir y enviar tu propio .GIF</span>
              </button>
            </div>
          )}

          {mediaTab === 'stickers' && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStickerCreatorOpen(true)}
                className="txl-btn-primary w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Crear nuevo Sticker personalizado</span>
              </button>

              {userStickers.length === 0 ? (
                <p className="text-xs text-center text-[#B8A9D9] py-4">
                  Dibuja o sube tu primer sticker para enviarlo en cualquier sala del mundo.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
                  {userStickers.map((st) => (
                    <div
                      key={st.id}
                      className="relative rounded-xl bg-[#130926] border border-purple-400/25 hover:border-[#EC4899] p-2 flex flex-col items-center gap-1"
                    >
                      {(st.creatorId === currentUserId || canModerate) && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSticker(st.id)}
                          aria-label="Eliminar sticker"
                          className="absolute top-1 right-1 text-[#9E8CC4] hover:text-rose-300 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void onSendMedia({
                            kind: 'sticker',
                            mediaUrl: st.imageUrl,
                            content: st.name,
                          });
                          setMediaDrawerOpen(false);
                        }}
                        className="flex flex-col items-center gap-1 w-full cursor-pointer"
                      >
                        <img
                          src={st.imageUrl}
                          alt={st.name}
                          className="w-14 h-14 object-contain"
                        />
                        <span className="text-[10px] text-white truncate max-w-full">
                          {st.name}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selector de regalos integrado en RoomChat */}
      {giftSelectorOpen && (
        <div className="rounded-2xl bg-[#1B0E35] border border-amber-400/50 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-white">
                {lang === 'es' ? 'Selector de regalos TXLsocial' : 'TXLsocial Gift Selector'}
              </p>
              <p className="text-[11px] text-amber-200 font-mono-num">
                {lang === 'es' ? 'Tus monedas:' : 'Your coins:'}{' '}
                {infiniteCoins ? '∞ (Dueño)' : userCoins.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGiftSelectorOpen(false)}
              aria-label="Cerrar selector de regalos"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B8A9D9] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {GIFT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setGiftCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  giftCategory === cat
                    ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white'
                    : 'bg-[#130926] border border-purple-400/25 text-[#C4B5FD]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {filteredGifts.map((g) => {
              const canAfford = infiniteCoins || userCoins >= g.coins;
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={sendingGiftId !== null}
                  onClick={() => void handlePickGift(g.id)}
                  className={`rounded-xl bg-[#130926] border p-2.5 flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50 transition-colors ${
                    canAfford
                      ? 'border-amber-400/35 hover:border-[#EC4899]'
                      : 'border-purple-400/20 opacity-75 hover:border-amber-400/50'
                  }`}
                >
                  <GiftArtwork
                    giftId={g.id}
                    imageUrl={g.imageUrl}
                    spriteCrop={g.spriteCrop}
                    emoji={g.emoji}
                    name={g.name}
                    sizeClass="w-12 h-12"
                  />
                  <span className="text-xs font-semibold text-white truncate max-w-full">
                    {g.name}
                  </span>
                  <span className="text-[11px] font-bold text-amber-300 font-mono-num flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    {g.coins.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Área de entrada inferior: emojis/GIFs/stickers, texto, regalos, nota de voz y enviar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setGiftSelectorOpen(false);
            setMediaDrawerOpen((prev) => !prev);
          }}
          aria-label="Emojis, GIFs y Stickers"
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            mediaDrawerOpen
              ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
              : 'bg-[#1D1238] border-purple-400/45 text-[#E5DBFF] hover:border-[#EC4899]'
          }`}
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder={
            recordingNote
              ? `Grabando nota de voz... ${recordingSeconds}s`
              : lang === 'es'
                ? 'Mensaje, emoji o audio...'
                : 'Message, emoji or audio...'
          }
          disabled={recordingNote}
          maxLength={500}
          className="txl-input flex-1 rounded-full px-3.5 sm:px-4 py-2.5 text-sm min-h-[44px] min-w-0 disabled:opacity-75"
        />

        <button
          type="button"
          onClick={() => {
            setMediaDrawerOpen(false);
            setGiftSelectorOpen((prev) => !prev);
          }}
          aria-label={lang === 'es' ? 'Selector de regalos' : 'Gift selector'}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            giftSelectorOpen
              ? 'bg-amber-400/25 border-amber-300 text-amber-200'
              : 'bg-[#2B1F16]/90 border-amber-400/65 text-amber-300 hover:bg-amber-400/20'
          }`}
        >
          <Gift className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onToggleVoiceNote}
          aria-label={
            recordingNote
              ? lang === 'es'
                ? 'Detener grabación'
                : 'Stop recording'
              : lang === 'es'
                ? 'Grabar nota de voz'
                : 'Record voice note'
          }
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
            recordingNote
              ? 'bg-rose-500 border-rose-300 text-white'
              : 'bg-[#171B3A] border-[#38BDF8]/60 text-[#38BDF8] hover:bg-[#38BDF8]/15'
          }`}
        >
          {recordingNote ? <Square className="w-4 h-4 fill-white" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          type="submit"
          disabled={sendingMsg || recordingNote || !chatText.trim()}
          aria-label={lang === 'es' ? 'Enviar mensaje' : 'Send message'}
          className="txl-btn-primary w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <StickerCreatorModal
        open={stickerCreatorOpen}
        onClose={() => setStickerCreatorOpen(false)}
        onCreated={(sticker, sendImmediately) => {
          setCustomStickers((prev) => [sticker, ...prev]);
          if (sendImmediately) {
            void onSendMedia({
              kind: 'sticker',
              mediaUrl: sticker.imageUrl,
              content: sticker.name,
            });
            setMediaDrawerOpen(false);
          }
        }}
      />
    </div>
  );
}
