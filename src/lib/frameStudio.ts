export type FrameStudioStyle =
  | 'dragon-gold'
  | 'neon-ring'
  | 'cyber-hex'
  | 'galaxy-aura'
  | 'anime-flame';

export interface FrameStudioConfig {
  style: FrameStudioStyle;
  primaryColor: string;
  secondaryColor: string;
  thickness: number; // 18..48
  glow: number; // 0..32
  emblem: string; // emoji or ''
  labelTop: string;
}

export function renderFrameToPngDataUrl(config: FrameStudioConfig): string {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);

  const outerRadius = 216;
  const ringWidth = Math.max(16, Math.min(50, config.thickness));
  const midRadius = outerRadius - ringWidth / 2;

  ctx.save();
  ctx.shadowColor = config.primaryColor;
  ctx.shadowBlur = config.glow;

  const grad = ctx.createLinearGradient(40, 40, size - 40, size - 40);
  grad.addColorStop(0, config.primaryColor);
  grad.addColorStop(0.5, config.secondaryColor);
  grad.addColorStop(1, config.primaryColor);

  if (config.style === 'dragon-gold') {
    // Ornate metallic outer bezel + inner glowing trim inspired by classic anime medallion frames
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFF5CC';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius - ringWidth + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#4A2400';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Ornate nodes around ring
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12;
      const nx = cx + Math.cos(angle) * midRadius;
      const ny = cy + Math.sin(angle) * midRadius;
      ctx.beginPath();
      ctx.arc(nx, ny, i % 3 === 0 ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? config.secondaryColor : '#FFFFFF';
      ctx.fill();
    }
  } else if (config.style === 'cyber-hex') {
    // Segmented sci-fi HUD arc brackets
    const segments = 6;
    const gap = 0.16;
    const span = (Math.PI * 2) / segments - gap;
    ctx.lineCap = 'butt';
    for (let i = 0; i < segments; i++) {
      const start = i * ((Math.PI * 2) / segments);
      ctx.beginPath();
      ctx.arc(cx, cy, midRadius, start, start + span);
      ctx.strokeStyle = i % 2 === 0 ? config.primaryColor : config.secondaryColor;
      ctx.lineWidth = ringWidth * 0.82;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius - ringWidth - 6, 0, Math.PI * 2);
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = config.secondaryColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (config.style === 'galaxy-aura') {
    // Layered orbital rings + twinkling star sparkles
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = ringWidth * 0.72;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, outerRadius + 10, outerRadius - 28, -0.35, 0, Math.PI * 2);
    ctx.strokeStyle = config.secondaryColor;
    ctx.lineWidth = 5;
    ctx.stroke();

    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI * 2) / 16 + 0.2;
      const r = midRadius + (i % 2 === 0 ? 12 : -8);
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 2 === 0 ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  } else if (config.style === 'anime-flame') {
    // Dynamic spiky energy aura around circular frame
    ctx.beginPath();
    const spikes = 28;
    for (let i = 0; i <= spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes;
      const r =
        i % 2 === 0 ? outerRadius + 16 : outerRadius - Math.max(8, ringWidth * 0.45);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(12, ringWidth * 0.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, midRadius - 4, 0, Math.PI * 2);
    ctx.strokeStyle = config.secondaryColor;
    ctx.lineWidth = Math.max(10, ringWidth * 0.45);
    ctx.stroke();
  } else {
    // 'neon-ring': crisp dual-tone glowing circular frame
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();

  // Punch clean transparent circular cutout in center so avatar never gets covered inside
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, outerRadius - ringWidth - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Optional bottom emblem badge on the frame
  if (config.emblem.trim()) {
    ctx.save();
    ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = config.primaryColor;
    ctx.shadowBlur = 14;
    ctx.fillText(config.emblem.trim(), cx, cy + outerRadius - ringWidth / 2);
    ctx.restore();
  }

  // Optional top curved nameplate pill
  if (config.labelTop.trim()) {
    const text = config.labelTop.trim().slice(0, 14).toUpperCase();
    ctx.save();
    ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const pillW = Math.min(220, Math.max(96, metrics.width + 32));
    const pillH = 34;
    const px = cx - pillW / 2;
    const py = cy - outerRadius - 6;

    ctx.fillStyle = '#120824';
    ctx.strokeStyle = config.secondaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, 17);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, py + pillH / 2 + 1);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}
