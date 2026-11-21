let memorySessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  memorySessionToken = token;
}

export function getSessionToken(): string | null {
  return memorySessionToken;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'X-Requested-With': 'TXLsocial',
  };

  if (memorySessionToken) {
    headers['Authorization'] = `Bearer ${memorySessionToken}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as {error?: string} & T;
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

export function formatRelativeTime(timestamp: number, lang: 'es' | 'en' = 'es'): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return lang === 'es' ? 'Ahora' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return lang === 'es' ? `Hace ${diffMin}m` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return lang === 'es' ? `Hace ${diffHr}h` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return lang === 'es' ? `Hace ${diffDays}d` : `${diffDays}d ago`;
}

export async function readAndCompressImage(file: File, maxDim = 960): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Error al procesar imagen.');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.84);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readBannerOrBackgroundImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1080
): Promise<string> {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const lowerName = file.name.toLowerCase();
  const hasAllowedExt =
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp');
  if (!allowedTypes.includes(file.type) && !hasAllowedExt) {
    throw new Error('Formato no permitido. Usa una imagen JPG, PNG o WEBP.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('La imagen pesa demasiado (máximo 12 MB).');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Error al procesar la imagen.');
    ctx.drawImage(img, 0, 0, width, height);
    const outMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(outMime, 0.85);
    if (dataUrl.length > 3_300_000) {
      return canvas.toDataURL('image/jpeg', 0.72);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readPngFrameImage(file: File, maxDim = 512): Promise<string> {
  if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
    throw new Error('El marco debe ser un archivo .png con fondo transparente.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer el archivo PNG.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Error al procesar el marco PNG.');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readStickerOrGifFile(file: File, maxDim = 320): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona una imagen válida (.png, .gif o .webp).');
  }
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
    if (file.size > 1_900_000) {
      throw new Error('El GIF supera el máximo permitido de 1.9 MB.');
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('No se pudo leer el archivo GIF.'));
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo GIF.'));
      reader.readAsDataURL(file);
    });
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Error al procesar sticker.');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
