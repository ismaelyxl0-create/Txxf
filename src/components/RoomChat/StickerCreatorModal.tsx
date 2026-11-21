import {useEffect, useRef, useState} from 'react';
import {Eraser, ImagePlus, Paintbrush, Sparkles, Trash2, Type, X} from 'lucide-react';
import {apiRequest, readStickerOrGifFile} from '../../lib/api.ts';
import type {CustomStickerItem} from '../../types.ts';

const BRUSH_COLORS = ['#FF4D9D', '#8B5CF6', '#38BDF8', '#FBBF24', '#10B981', '#FFFFFF', '#F43F5E'];

export function StickerCreatorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (sticker: CustomStickerItem, sendImmediately: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'sticker' | 'emoji'>('sticker');
  const [brushColor, setBrushColor] = useState('#FF4D9D');
  const [brushSize, setBrushSize] = useState(10);
  const [eraser, setEraser] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{x: number; y: number} | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [open]);

  if (!open) return null;

  function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (uploadedDataUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pos = getCanvasCoords(e);
    lastPosRef.current = pos;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = brushColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPosRef.current || uploadedDataUrl) return;
    const pos = getCanvasCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();
    lastPosRef.current = pos;
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPosRef.current = null;
  }

  function handleClearCanvas() {
    setUploadedDataUrl(null);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function handleStampText() {
    const text = overlayText.trim();
    if (!text || !canvasRef.current) return;
    setUploadedDataUrl(null);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.font = 'bold 38px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#120824';
    ctx.strokeText(text, 128, 128);
    ctx.fillStyle = brushColor;
    ctx.fillText(text, 128, 128);
    ctx.restore();
    setOverlayText('');
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readStickerOrGifFile(file, 320);
      setUploadedDataUrl(dataUrl);
      if (!name.trim()) {
        setName(file.name.replace(/\.(png|gif|webp|jpg|jpeg)$/i, '').slice(0, 24));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el sticker');
    }
  }

  async function handleSave(sendImmediately: boolean) {
    setError(null);
    const finalUrl = uploadedDataUrl || canvasRef.current?.toDataURL('image/png') || '';
    if (!finalUrl) {
      setError('Dibuja tu sticker o selecciona una imagen.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest<{sticker: CustomStickerItem}>('/api/stickers', {
        method: 'POST',
        body: {
          name: name.trim() || (kind === 'emoji' ? 'Emoji Neón' : 'Mi Sticker'),
          kind,
          imageUrl: finalUrl,
        },
      });
      onCreated(res.sticker, sendImmediately);
      setName('');
      setUploadedDataUrl(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando el sticker');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FF4D9D]" />
            <h2 className="font-display text-lg font-bold text-white">
              Creador de Stickers y Emojis
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar creador de stickers"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#B8A9D9] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-3.5 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('sticker')}
            className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
              kind === 'sticker'
                ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                : 'bg-[#140A29] border-purple-400/25 text-[#B8A9D9]'
            }`}
          >
            Sticker Personalizado
          </button>
          <button
            type="button"
            onClick={() => setKind('emoji')}
            className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
              kind === 'emoji'
                ? 'bg-[#8B5CF6]/25 border-[#8B5CF6] text-white'
                : 'bg-[#140A29] border-purple-400/25 text-[#B8A9D9]'
            }`}
          >
            Emoji Personalizado
          </button>
        </div>

        {/* Drawing / Preview Canvas */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative w-56 h-56 rounded-2xl border border-purple-400/40 bg-[radial-gradient(#2c1654_1px,transparent_1px)] [background-size:12px_12px] bg-[#120824] overflow-hidden flex items-center justify-center">
            {uploadedDataUrl ? (
              <img
                src={uploadedDataUrl}
                alt="Vista previa sticker"
                className="w-full h-full object-contain"
              />
            ) : (
              <canvas
                ref={canvasRef}
                width={256}
                height={256}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-full touch-none cursor-crosshair"
              />
            )}
          </div>

          {/* Drawing Tools */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {BRUSH_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      setEraser(false);
                      setBrushColor(col);
                    }}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                      !eraser && brushColor === col ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{backgroundColor: col}}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEraser((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 cursor-pointer ${
                    eraser
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                      : 'bg-[#170A2B] border-purple-400/30 text-[#D8CCF4]'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Borrar</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#170A2B] border border-purple-400/30 text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Paintbrush className="w-3.5 h-3.5 text-[#C084FC]" />
              <input
                type="range"
                min={4}
                max={26}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="flex-1 accent-[#FF4D9D]"
              />
              <span className="text-[11px] font-mono-num text-[#B8A9D9]">{brushSize}px</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                maxLength={14}
                placeholder="Texto o emoji para estampar..."
                className="txl-input flex-1 rounded-xl px-3 py-2 text-xs min-h-[36px]"
              />
              <button
                type="button"
                onClick={handleStampText}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#251544] border border-purple-400/35 text-white flex items-center gap-1 cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Estampar</span>
              </button>
            </div>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/gif,image/webp,image/jpeg"
          onChange={handleFilePick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full py-2.5 px-4 rounded-xl border border-dashed border-cyan-400/50 bg-cyan-500/10 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ImagePlus className="w-4 h-4" />
          <span>O subir imagen / PNG / GIF desde tu dispositivo</span>
        </button>

        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={28}
            placeholder="Nombre del sticker o emoji..."
            className="txl-input w-full rounded-xl px-3.5 py-2.5 text-xs min-h-[40px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave(false)}
            className="py-2.5 px-3 rounded-full text-xs font-semibold bg-[#251544] border border-purple-400/35 text-white cursor-pointer disabled:opacity-50"
          >
            Guardar en bandeja
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave(true)}
            className="txl-btn-primary py-2.5 px-3 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar y Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
