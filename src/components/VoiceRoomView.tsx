import {useEffect, useRef, useState} from 'react';
import {
  ArrowLeft,
  AudioLines,
  BadgeCheck,
  Ban,
  Coins,
  Gem,
  Globe,
  Hand,
  ImagePlus,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Settings,
  Share2,
  Shield,
  UserMinus,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import {
  apiRequest,
  formatRelativeTime,
  getSessionToken,
  readBannerOrBackgroundImage,
} from '../lib/api.ts';
import {GIFT_BY_ID, type GiftAnimationType} from '../lib/gifts.ts';
import type {BadgeTier, CircleItem, LanguageCode, UserProfile, VoiceParticipant} from '../types.ts';
import {GiftArtwork} from './GiftArtwork.tsx';
import {RoomChat} from './RoomChat/index.ts';
import {ShareAndInstallModal} from './ShareAndInstallModal.tsx';
import {AvatarWithFrame, SafeImage, VerificationBadge} from './TxlLogo.tsx';

interface ActiveGiftEvent {
  id: string;
  giftId: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  coins: number;
  category: string;
  animationType?: GiftAnimationType;
  senderName: string;
  senderAvatar: string;
  createdAt: number;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : input[start] || 0;
  }
  return result;
}

function floatToInt16Base64(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function int16Base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const len = Math.floor(binary.length / 2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function VoiceRoomView({
  initialCircle,
  initialMode = 'voice',
  currentUser,
  lang,
  onBack,
  onCircleUpdated,
  onUserUpdated,
  onVoiceCountRefresh,
}: {
  initialCircle: CircleItem;
  initialMode?: 'voice' | 'chat';
  currentUser: UserProfile;
  lang: LanguageCode;
  onBack: () => void;
  onCircleUpdated: (circle: CircleItem) => void;
  onUserUpdated: (user: UserProfile) => void;
  onVoiceCountRefresh: () => void;
}) {
  const [circle, setCircle] = useState<CircleItem>(initialCircle);
  const [viewMode, setViewMode] = useState<'voice' | 'chat'>(initialMode);
  const [sendingMsg, setSendingMsg] = useState(false);

  // Audio / Mic live streaming & listener state
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micPermissionBlocked, setMicPermissionBlocked] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [recordingNote, setRecordingNote] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Live Gift 3-second animation queue & Share Modal
  const [giftQueue, setGiftQueue] = useState<ActiveGiftEvent[]>([]);
  const [activeGift, setActiveGift] = useState<ActiveGiftEvent | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const seenGiftIdsRef = useRef<Set<string>>(new Set());

  // Modals & per-user audio prefs
  const [locallyMutedIds, setLocallyMutedIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<VoiceParticipant | null>(null);

  // Room settings form state
  const [roomNameInput, setRoomNameInput] = useState(initialCircle.name);
  const [roomDescInput, setRoomDescInput] = useState(initialCircle.description);
  const [maxSpeakersInput, setMaxSpeakersInput] = useState(
    initialCircle.roomSettings?.maxSpeakers || 120
  );
  const [handRaiseRequiredInput, setHandRaiseRequiredInput] = useState(
    initialCircle.roomSettings?.handRaiseRequired ?? false
  );
  const [roomBgDraft, setRoomBgDraft] = useState<string | null>(
    initialCircle.roomBackgroundUrl || null
  );
  const [roomSettingsError, setRoomSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const roomBgFileRef = useRef<HTMLInputElement | null>(null);
  const [confirmBlockParticipant, setConfirmBlockParticipant] = useState(false);

  // WebSocket & WebAudio Refs (multi-speaker mixer + jitter cushion)
  const wsRef = useRef<WebSocket | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const speakerGainsRef = useRef<Record<string, GainNode>>({});
  const speakerLastHeardRef = useRef<Record<string, number>>({});
  const speakerMutedRef = useRef(false);
  const volumeRef = useRef(100);
  const nextPlayTimeRef = useRef<Record<string, number>>({});
  const speakingTimeoutsRef = useRef<Record<string, number>>({});
  const captureCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const noteChunksRef = useRef<Blob[]>([]);
  const noteStartRef = useRef<number>(0);

  const micActiveRef = useRef(false);
  const micTogglingRef = useRef(false);
  const micToggleGraceUntilRef = useRef(0);
  const locallyMutedIdsRef = useRef<string[]>([]);
  const blockedUsersRef = useRef<string[]>(currentUser.blockedUsers || []);
  const [micToggling, setMicToggling] = useState(false);

  const isInsecureHttp =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    speakerMutedRef.current = speakerMuted;
    volumeRef.current = volume;
    if (masterGainRef.current && playbackCtxRef.current) {
      const targetGain = speakerMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
      masterGainRef.current.gain.setValueAtTime(
        targetGain,
        playbackCtxRef.current.currentTime
      );
    }
  }, [speakerMuted, volume]);

  useEffect(() => {
    micActiveRef.current = micActive;
  }, [micActive]);

  useEffect(() => {
    locallyMutedIdsRef.current = locallyMutedIds;
  }, [locallyMutedIds]);

  useEffect(() => {
    blockedUsersRef.current = currentUser.blockedUsers || [];
  }, [currentUser.blockedUsers]);

  useEffect(() => {
    if (activeGift || giftQueue.length === 0) return;
    const [next, ...rest] = giftQueue;
    setActiveGift(next);
    setGiftQueue(rest);
    const timer = window.setTimeout(() => {
      setActiveGift(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activeGift, giftQueue]);

  useEffect(() => {
    const unlockAudio = () => {
      if (playbackCtxRef.current && playbackCtxRef.current.state === 'suspended') {
        playbackCtxRef.current
          .resume()
          .then(() => setAudioBlocked(false))
          .catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', unlockAudio, {passive: true});
    window.addEventListener('keydown', unlockAudio, {passive: true});
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!recordingNote) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordingNote]);

  function updateCircleState(next: CircleItem) {
    setCircle(next);
    onCircleUpdated(next);
  }

  function ensurePlaybackGraph() {
    if (!playbackCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;

      const masterGain = ctx.createGain();
      masterGain.gain.value = speakerMutedRef.current
        ? 0
        : Math.max(0, Math.min(1, volumeRef.current / 100));

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);
      playbackCtxRef.current = ctx;
      compressorRef.current = compressor;
      masterGainRef.current = masterGain;
    }
    if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current
        .resume()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    } else {
      setAudioBlocked(false);
    }
  }

  function markSpeakingTemporarily(userId: string, active: boolean) {
    setSpeakingMap((prev) => ({...prev, [userId]: active}));
    if (speakingTimeoutsRef.current[userId]) {
      window.clearTimeout(speakingTimeoutsRef.current[userId]);
    }
    if (active) {
      speakingTimeoutsRef.current[userId] = window.setTimeout(() => {
        setSpeakingMap((prev) => ({...prev, [userId]: false}));
      }, 900);
    }
  }

  function scheduleRemoteAudio(userId: string, pcmBase64: string, sampleRate: number) {
    try {
      if (
        locallyMutedIdsRef.current.includes(userId) ||
        blockedUsersRef.current.includes(userId)
      ) {
        return;
      }
      ensurePlaybackGraph();
      const ctx = playbackCtxRef.current;
      const mixTarget = compressorRef.current || masterGainRef.current;
      if (!ctx || !mixTarget) return;
      if (ctx.state === 'suspended') {
        setAudioBlocked(true);
        return;
      }

      const samples = int16Base64ToFloat32(pcmBase64);
      if (samples.length === 0) return;

      const nowMs = Date.now();
      speakerLastHeardRef.current[userId] = nowMs;
      let activeCount = 0;
      for (const [id, lastTs] of Object.entries(speakerLastHeardRef.current)) {
        if (nowMs - lastTs < 600) {
          activeCount++;
        } else {
          delete speakerLastHeardRef.current[id];
        }
      }

      // Dynamic multi-speaker auto-ducking so 10+ simultaneous voices blend cleanly without clipping
      const balancedGain =
        activeCount <= 1 ? 1.0 : Math.max(0.45, 1.15 / Math.sqrt(activeCount));
      let speakerGain = speakerGainsRef.current[userId];
      if (!speakerGain) {
        speakerGain = ctx.createGain();
        speakerGain.gain.value = balancedGain;
        speakerGain.connect(mixTarget);
        speakerGainsRef.current[userId] = speakerGain;
      } else {
        speakerGain.gain.setTargetAtTime(balancedGain, ctx.currentTime, 0.04);
      }

      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(speakerGain);

      // International jitter cushion (45ms base cushion, 380ms drift resync)
      const now = ctx.currentTime;
      const prevEnd = nextPlayTimeRef.current[userId] || 0;
      const startAt = prevEnd > now && prevEnd - now < 0.38 ? prevEnd : now + 0.045;
      source.start(startAt);
      nextPlayTimeRef.current[userId] = startAt + buffer.duration;

      markSpeakingTemporarily(userId, true);
    } catch {
      // Ignore malformed audio frames
    }
  }

  // Auto-join voice stage and request microphone permissions when entering in 'voice' mode
  useEffect(() => {
    let cancelled = false;
    ensurePlaybackGraph();
    async function syncAndJoin() {
      try {
        if (initialMode === 'voice' && !initialCircle.inVoice) {
          const res = await apiRequest<{circle: CircleItem}>(
            `/api/circles/${initialCircle.id}/voice`,
            {method: 'POST', body: {action: 'join', muted: true}}
          );
          if (!cancelled) {
            updateCircleState(res.circle);
            onVoiceCountRefresh();
          }
        } else {
          const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${initialCircle.id}`);
          if (!cancelled) updateCircleState(res.circle);
        }

        if (initialMode === 'voice' && !cancelled) {
          const granted = await startMicCapture();
          if (granted && !cancelled) {
            const unmutedRes = await apiRequest<{circle: CircleItem}>(
              `/api/circles/${initialCircle.id}/voice`,
              {method: 'POST', body: {action: 'set-muted', muted: false}}
            ).catch(() => null);
            if (unmutedRes && !cancelled) {
              updateCircleState(unmutedRes.circle);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAudioNotice(err instanceof Error ? err.message : 'No se pudo conectar a la sala.');
        }
      }
    }
    void syncAndJoin();
    return () => {
      cancelled = true;
    };
  }, [initialCircle.id]);

  // Persistent WebSocket connection for real-time stage, gifts, events, chat & global voice relay
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    function enqueueGift(giftEvent: ActiveGiftEvent) {
      if (seenGiftIdsRef.current.has(giftEvent.id)) return;
      seenGiftIdsRef.current.add(giftEvent.id);
      setGiftQueue((prev) => [...prev, giftEvent]);
    }

    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'room:join',
            circleId: initialCircle.id,
            token: getSessionToken(),
          })
        );
        ws.send(JSON.stringify({type: 'ws:ping', ts: Date.now()}));
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'ws:ping', ts: Date.now()}));
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            circle?: CircleItem;
            userId?: string;
            speaking?: boolean;
            pcm?: string;
            sampleRate?: number;
            ts?: number;
            giftEvent?: ActiveGiftEvent;
          };
          if (msg.type === 'ws:pong' && typeof msg.ts === 'number') {
            setLatencyMs(Math.max(1, Date.now() - msg.ts));
          } else if (msg.type === 'room:gift' && msg.giftEvent) {
            enqueueGift(msg.giftEvent);
          } else if (msg.type === 'room:sync' && msg.circle) {
            updateCircleState(msg.circle);
            onVoiceCountRefresh();
            const meInStage = msg.circle.voiceParticipants.find(
              (vp) => vp.userId === currentUser.id
            );
            if (
              meInStage?.muted &&
              micActiveRef.current &&
              Date.now() > micToggleGraceUntilRef.current
            ) {
              stopMicCapture();
              setAudioNotice('Tu micrófono fue apagado en la sala.');
            }
          } else if (msg.type === 'voice:speaking' && msg.userId) {
            markSpeakingTemporarily(msg.userId, Boolean(msg.speaking));
          } else if (msg.type === 'voice:audio' && msg.userId && msg.pcm) {
            scheduleRemoteAudio(msg.userId, msg.pcm, msg.sampleRate || 16000);
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connectWs, 1600);
        }
      };
    }

    connectWs();
    return () => {
      closedByUnmount = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      Object.values(speakingTimeoutsRef.current).forEach((t) => window.clearTimeout(t));
      Object.values(speakerGainsRef.current).forEach((g) => {
        try {
          g.disconnect();
        } catch {
          // ignore
        }
      });
      speakerGainsRef.current = {};
      speakerLastHeardRef.current = {};
      wsRef.current?.close();
      stopMicCapture();
      playbackCtxRef.current?.close().catch(() => undefined);
      playbackCtxRef.current = null;
      compressorRef.current = null;
    };
  }, [initialCircle.id]);

  function stopMicCapture() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => undefined);
      captureCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const t of mediaStreamRef.current.getTracks()) {
        t.stop();
      }
      mediaStreamRef.current = null;
    }
    micActiveRef.current = false;
    setMicActive(false);
    setMicLevel(0);
    setSpeakingMap((prev) => ({...prev, [currentUser.id]: false}));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({type: 'voice:speaking', speaking: false}));
    }
  }

  function cleanupMicNodes() {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => undefined);
      captureCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const t of mediaStreamRef.current.getTracks()) {
        t.stop();
      }
      mediaStreamRef.current = null;
    }
  }

  async function startMicCapture(): Promise<boolean> {
    setAudioNotice(null);
    ensurePlaybackGraph();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermissionBlocked(true);
      setAudioNotice('Se necesita acceso al micrófono para hablar');
      return false;
    }
    try {
      cleanupMicNodes();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      setMicPermissionBlocked(false);
      mediaStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const ctx = new AudioCtx();
      captureCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      const bufferSize = ctx.sampleRate >= 44100 ? 2048 : 1024;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      let lastSpeakingState = false;
      let lastVoiceDetectedAt = 0;
      let lastMeterUpdateAt = 0;

      processor.onaudioprocess = (ev) => {
        if (!micActiveRef.current) return;
        const rawInput = ev.inputBuffer.getChannelData(0);
        analyser.getByteFrequencyData(freqData);
        let freqSum = 0;
        for (let i = 0; i < freqData.length; i++) {
          freqSum += freqData[i];
        }
        const avgFreq = freqSum / freqData.length;

        let sumSq = 0;
        for (let i = 0; i < rawInput.length; i++) {
          sumSq += rawInput[i] * rawInput[i];
        }
        const rms = Math.sqrt(sumSq / rawInput.length);
        const now = Date.now();
        if (rms > 0.006 || avgFreq > 8) {
          lastVoiceDetectedAt = now;
        }

        if (now - lastMeterUpdateAt > 90) {
          lastMeterUpdateAt = now;
          setMicLevel(Math.min(100, Math.round(rms * 500)));
        }

        // Hold visual/active state for 2 seconds of silence while keeping mic open
        const isSpeakingNow = now - lastVoiceDetectedAt < 2000;

        if (isSpeakingNow !== lastSpeakingState) {
          lastSpeakingState = isSpeakingNow;
          setSpeakingMap((prev) => ({...prev, [currentUser.id]: isSpeakingNow}));
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({type: 'voice:speaking', speaking: isSpeakingNow})
            );
          }
        }

        if (isSpeakingNow && wsRef.current?.readyState === WebSocket.OPEN) {
          const resampled = downsampleTo16k(rawInput, ctx.sampleRate);
          wsRef.current.send(
            JSON.stringify({
              type: 'voice:audio',
              sampleRate: 16000,
              pcm: floatToInt16Base64(resampled),
            })
          );
        }
      };

      const zeroGain = ctx.createGain();
      zeroGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(ctx.destination);
      micActiveRef.current = true;
      setMicActive(true);
      return true;
    } catch {
      cleanupMicNodes();
      micActiveRef.current = false;
      setMicActive(false);
      setMicPermissionBlocked(true);
      setAudioNotice('Se necesita acceso al micrófono para hablar');
      return false;
    }
  }

  const myParticipant = circle.voiceParticipants.find((vp) => vp.userId === currentUser.id);
  const isMuted = myParticipant ? myParticipant.muted : true;

  async function handleToggleMic() {
    if (micTogglingRef.current) return;
    micTogglingRef.current = true;
    setMicToggling(true);
    setAudioNotice(null);
    ensurePlaybackGraph();
    try {
      const micIsLive = !isMuted && micActiveRef.current;

      if (micIsLive) {
        // Turn microphone OFF immediately
        micToggleGraceUntilRef.current = Date.now() + 2000;
        stopMicCapture();
        if (myParticipant) {
          const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
            method: 'POST',
            body: {action: 'set-muted', muted: true},
          });
          updateCircleState(res.circle);
        }
        return;
      }

      // Turn microphone ON: request browser permission inside user click gesture first
      const granted = await startMicCapture();
      if (!granted) return;

      micToggleGraceUntilRef.current = Date.now() + 2500;
      try {
        if (!myParticipant) {
          const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
            method: 'POST',
            body: {action: 'join', muted: false},
          });
          updateCircleState(res.circle);
          onVoiceCountRefresh();
        } else {
          const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
            method: 'POST',
            body: {action: 'set-muted', muted: false},
          });
          updateCircleState(res.circle);
        }
      } catch (err) {
        stopMicCapture();
        setAudioNotice(
          err instanceof Error ? err.message : 'No se pudo activar el micrófono en la sala.'
        );
      }
    } finally {
      micTogglingRef.current = false;
      setMicToggling(false);
    }
  }

  async function handleToggleHand() {
    ensurePlaybackGraph();
    if (!myParticipant) {
      await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
        method: 'POST',
        body: {action: 'join', muted: true},
      });
    }
    const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
      method: 'POST',
      body: {action: 'toggle-hand'},
    });
    updateCircleState(res.circle);
  }

  async function handleLeaveVoice() {
    stopMicCapture();
    const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/voice`, {
      method: 'POST',
      body: {action: 'leave'},
    });
    updateCircleState(res.circle);
    onVoiceCountRefresh();
    onBack();
  }

  async function handleSendText(text: string) {
    setSendingMsg(true);
    try {
      const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/messages`, {
        method: 'POST',
        body: {kind: 'text', content: text},
      });
      updateCircleState(res.circle);
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleSendMedia(payload: {
    kind: 'sticker' | 'gif';
    mediaUrl: string;
    content: string;
  }) {
    setSendingMsg(true);
    try {
      const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/messages`, {
        method: 'POST',
        body: payload,
      });
      updateCircleState(res.circle);
    } catch (err) {
      setAudioNotice(err instanceof Error ? err.message : 'No se pudo enviar el contenido');
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleReactMessage(msgId: string, emoji: string) {
    try {
      const res = await apiRequest<{circle: CircleItem}>(
        `/api/circles/${circle.id}/messages/${msgId}/react`,
        {
          method: 'POST',
          body: {emoji},
        }
      );
      updateCircleState(res.circle);
    } catch {
      // Ignore reaction toggle errors silently
    }
  }

  async function handleToggleVoiceNote() {
    setAudioNotice(null);
    if (recordingNote && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecordingNote(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioNotice('Grabación de audio no disponible en este navegador.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const chosenMime =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredTypes.find((mime) => MediaRecorder.isTypeSupported(mime))
          : undefined;
      const recorder = chosenMime
        ? new MediaRecorder(stream, {mimeType: chosenMime})
        : new MediaRecorder(stream);
      noteChunksRef.current = [];
      noteStartRef.current = Date.now();
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) noteChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        for (const t of stream.getTracks()) t.stop();
        const finalMime = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(noteChunksRef.current, {type: finalMime});
        const durationSec = Math.max(1, Math.round((Date.now() - noteStartRef.current) / 1000));
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (typeof reader.result !== 'string') return;
          try {
            const res = await apiRequest<{circle: CircleItem}>(
              `/api/circles/${circle.id}/messages`,
              {
                method: 'POST',
                body: {
                  kind: 'audio',
                  content: `Nota de voz (${durationSec}s)`,
                  audioUrl: reader.result,
                  audioDurationSec: durationSec,
                },
              }
            );
            updateCircleState(res.circle);
          } catch (err) {
            setAudioNotice(err instanceof Error ? err.message : 'No se pudo enviar el audio');
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingNote(true);
    } catch {
      setAudioNotice('Permiso de micrófono requerido para enviar notas de voz.');
    }
  }

  async function handleSendGift(giftId: string) {
    setAudioNotice(null);
    try {
      const res = await apiRequest<{
        circle: CircleItem;
        user: UserProfile;
        giftEvent?: ActiveGiftEvent;
      }>(`/api/circles/${circle.id}/gifts`, {
        method: 'POST',
        body: {giftId},
      });
      updateCircleState(res.circle);
      onUserUpdated(res.user);
      if (res.giftEvent && !seenGiftIdsRef.current.has(res.giftEvent.id)) {
        seenGiftIdsRef.current.add(res.giftEvent.id);
        setGiftQueue((prev) => [...prev, res.giftEvent!]);
      }
    } catch (err) {
      setAudioNotice(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
    }
  }

  async function handleDeleteMessage(msgId: string) {
    const res = await apiRequest<{circle: CircleItem}>(
      `/api/circles/${circle.id}/messages/${msgId}`,
      {method: 'DELETE'}
    );
    updateCircleState(res.circle);
  }

  async function handleModerate(
    targetUserId: string,
    operation: 'mute' | 'toggle-mute' | 'kick' | 'toggle-mod' | 'lower-hand'
  ) {
    const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/moderate`, {
      method: 'POST',
      body: {targetUserId, operation},
    });
    updateCircleState(res.circle);
    setSelectedParticipant(null);
  }

  function handleToggleLocalParticipantMute(targetUserId: string) {
    setLocallyMutedIds((prev) =>
      prev.includes(targetUserId)
        ? prev.filter((id) => id !== targetUserId)
        : [...prev, targetUserId]
    );
  }

  async function handleOwnerAssignBadge(targetUserId: string, tier: BadgeTier) {
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${targetUserId}/badge`, {
        method: 'POST',
        body: {tier},
      });
      setSelectedParticipant((prev) =>
        prev && prev.userId === targetUserId
          ? {...prev, badgeTier: res.user.badgeTier, verified: res.user.verified}
          : prev
      );
      const circleRes = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}`);
      updateCircleState(circleRes.circle);
      setAudioNotice(`Verificable actualizado para @${res.user.username}.`);
    } catch (err) {
      setAudioNotice(err instanceof Error ? err.message : 'No se pudo actualizar el verificable');
    }
  }

  async function handleOwnerGiftCrystals(targetUserId: string, amount: number) {
    try {
      const res = await apiRequest<{user: UserProfile}>(
        `/api/admin/users/${targetUserId}/crystals`,
        {
          method: 'POST',
          body: {amount, mode: 'add'},
        }
      );
      setAudioNotice(`Asignaste +${amount} Cristales a @${res.user.username}.`);
    } catch (err) {
      setAudioNotice(err instanceof Error ? err.message : 'No se pudieron asignar Cristales');
    }
  }

  async function handleRoomBgPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRoomSettingsError(null);
    try {
      const dataUrl = await readBannerOrBackgroundImage(file, 1920, 1080);
      setRoomBgDraft(dataUrl);
    } catch (err) {
      setRoomSettingsError(
        err instanceof Error ? err.message : 'No se pudo cargar la imagen de fondo.'
      );
    }
  }

  async function handleSaveRoomSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setRoomSettingsError(null);
    try {
      const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}/settings`, {
        method: 'PATCH',
        body: {
          name: roomNameInput.trim(),
          description: roomDescInput.trim(),
          maxSpeakers: maxSpeakersInput,
          allowAllRegions: true,
          handRaiseRequired: handRaiseRequiredInput,
          roomBackgroundUrl: roomBgDraft,
        },
      });
      updateCircleState(res.circle);
      setSettingsOpen(false);
    } catch (err) {
      setRoomSettingsError(
        err instanceof Error ? err.message : 'Error al guardar la configuración de la sala.'
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleBlockSelectedParticipant() {
    if (!selectedParticipant) return;
    if (selectedParticipant.userId === currentUser.id || selectedParticipant.isAppOwner) return;
    try {
      const res = await apiRequest<{user: UserProfile}>(
        `/api/users/${selectedParticipant.userId}/block`,
        {method: 'POST'}
      );
      onUserUpdated(res.user);
      setSelectedParticipant(null);
      setConfirmBlockParticipant(false);
      const circleRes = await apiRequest<{circle: CircleItem}>(`/api/circles/${circle.id}`);
      updateCircleState(circleRes.circle);
    } catch (err) {
      setAudioNotice(err instanceof Error ? err.message : 'No se pudo bloquear al usuario');
    }
  }

  const canModerate =
    circle.myRole === 'Admin' || circle.myRole === 'Mod' || currentUser.role === 'owner';

  const activeSpeakers = circle.voiceParticipants.filter(
    (vp) => !vp.muted && (speakingMap[vp.userId] ?? vp.speaking)
  );

  const shareRoomUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?room=${circle.id}` : '';

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-8rem)] space-y-4 pb-4">
      {circle.roomBackgroundUrl && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <SafeImage
            src={circle.roomBackgroundUrl}
            alt={`Fondo de ${circle.name}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#0B0516]/72 backdrop-blur-[2px]" />
        </div>
      )}
      {/* ——— ANIMATED 3D GIFT 3-SECOND LIVE OVERLAY (UNIQUE PER GIFT) ——— */}
      {activeGift && (() => {
        const giftDef = GIFT_BY_ID[activeGift.giftId];
        const animType = activeGift.animationType || giftDef?.animationType || 'classic-pop';
        const glowColor = giftDef?.glowColor || '#EC4899';
        const particles = giftDef?.particles || [activeGift.emoji, '✨', '🌟', '🎉'];

        return (
          <div
            key={activeGift.id}
            aria-live="polite"
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center px-4"
          >
            <div className={`txl-anim-${animType} relative flex flex-col items-center text-center`}>
              {/* 6 custom flying particles per gift */}
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <span
                  key={idx}
                  aria-hidden="true"
                  className={`txl-particle-${idx} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl sm:text-3xl select-none z-20`}
                >
                  {particles[idx % particles.length]}
                </span>
              ))}

              <div
                className="relative rounded-3xl p-4 bg-[#190B33]/88 backdrop-blur-xl border-2"
                style={{
                  borderColor: `${glowColor}AA`,
                  boxShadow: `0 0 42px ${glowColor}75, 0 18px 40px rgba(0,0,0,0.6)`,
                }}
              >
                <GiftArtwork
                  giftId={activeGift.giftId}
                  imageUrl={activeGift.imageUrl}
                  spriteCrop={giftDef?.spriteCrop}
                  emoji={activeGift.emoji}
                  name={activeGift.name}
                  sizeClass="w-36 h-36 sm:w-40 sm:h-40"
                  isShowcase
                />
              </div>

              <div
                className="mt-3 rounded-2xl bg-[#130826]/95 border px-4 py-2 shadow-xl space-y-0.5"
                style={{borderColor: `${glowColor}88`}}
              >
                <div className="text-xs font-semibold text-[#FF88BE]">
                  {activeGift.senderName} envió un regalo 3D
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="font-display text-base font-bold text-white">
                    {activeGift.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 font-mono-num">
                    <Coins className="w-3.5 h-3.5" />
                    {activeGift.coins.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ——— CABECERA DE LA SALA DE VOZ ——— */}
      <div className="relative z-10 txl-card rounded-3xl px-4 py-3.5 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a círculos"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-white truncate">{circle.name}</h1>
            <p className="text-xs text-[#C4B5FD] truncate font-mono-num">
              Sala de Voz • {circle.voiceParticipants.length} conectados • Tu rol: {circle.myRole}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-[#2B1F16]/90 border border-amber-400/60 text-xs font-bold text-amber-200 flex items-center gap-1.5 font-mono-num">
            <Coins className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {currentUser.role === 'owner' || currentUser.infiniteCoins
                ? '∞'
                : currentUser.coins.toLocaleString()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            aria-label="Compartir sala en redes y app móvil"
            title="Compartir sala y App Móvil"
            className="min-w-[36px] min-h-[36px] px-2.5 flex items-center justify-center gap-1 rounded-full bg-[#1D1238] border border-purple-400/35 text-[#E5DBFF] hover:border-[#EC4899] text-xs font-medium cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#FF4D9D]" />
            <span className="hidden sm:inline">Compartir</span>
          </button>

          <button
            type="button"
            onClick={() => setSpeakerMuted((prev) => !prev)}
            aria-label={speakerMuted ? 'Activar audio de la sala' : 'Silenciar audio de la sala'}
            title={speakerMuted ? 'Audio silenciado' : 'Escuchando en vivo'}
            className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full border cursor-pointer ${
              speakerMuted
                ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                : 'bg-[#1D1238] border-purple-400/35 text-[#E5DBFF]'
            }`}
          >
            {speakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'voice' ? 'chat' : 'voice')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[36px] flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'chat'
                ? 'bg-[#38BDF8]/20 border border-[#38BDF8] text-white'
                : 'bg-[#1D1238] border border-[#38BDF8]/50 text-[#BAE6FD]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Grupal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRoomNameInput(circle.name);
              setRoomDescInput(circle.description);
              setMaxSpeakersInput(circle.roomSettings?.maxSpeakers || 120);
              setHandRaiseRequiredInput(circle.roomSettings?.handRaiseRequired ?? false);
              setRoomBgDraft(circle.roomBackgroundUrl || null);
              setRoomSettingsError(null);
              setSettingsOpen(true);
            }}
            aria-label="Configuración de la sala"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#FBBF24] hover:bg-amber-400/15 cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isInsecureHttp && (
        <div
          role="alert"
          className="relative z-10 rounded-2xl bg-rose-500/15 border border-rose-400/45 px-4 py-2.5 text-xs text-rose-100"
        >
          El audio del micrófono requiere conexión segura HTTPS para transmitir voz en navegadores
          móviles.
        </div>
      )}

      {audioBlocked && (
        <button
          type="button"
          onClick={ensurePlaybackGraph}
          className="relative z-10 w-full rounded-2xl bg-[#EC4899]/20 border border-[#EC4899]/60 px-4 py-3 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
        >
          <Volume2 className="w-4 h-4 text-[#FF4D9D]" />
          <span>Toca aquí para activar el audio en tiempo real de la sala</span>
        </button>
      )}

      {audioNotice && (
        <div
          role="status"
          className="relative z-10 rounded-2xl bg-amber-500/15 border border-amber-400/35 px-4 py-2.5 text-xs text-amber-100 flex items-center justify-between gap-2"
        >
          <span>{audioNotice}</span>
          <button
            type="button"
            onClick={() => setAudioNotice(null)}
            className="text-amber-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ——— ESCENARIO DE VOZ + INDICADOR EN VIVO DE QUIÉN ESTÁ HABLANDO ——— */}
      {viewMode === 'voice' && (
        <section className="relative z-10 rounded-3xl bg-[#1F1238]/85 border border-purple-400/25 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-base font-bold text-white">Escenario de Voz</h2>
              <span className="text-[11px] text-[#9E8CC4] font-mono-num flex items-center gap-1">
                <Globe className="w-3 h-3 text-[#38BDF8]" />
                Internacional · Sin regiones · {circle.voiceParticipants.length}/
                {circle.roomSettings?.maxSpeakers || 120}
              </span>
              {latencyMs !== null && (
                <span
                  className={`text-[11px] font-mono-num flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                    latencyMs <= 220
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                      : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  <span>
                    {latencyMs <= 220 ? 'Buena' : 'Inestable'} · {latencyMs} ms
                  </span>
                </span>
              )}
            </div>
            <span className="text-xs text-[#A998CC]">Toca un avatar para ver perfil / rol</span>
          </div>

          {/* Live Speaking Banner + Speaker Volume Slider */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div
              className={`flex-1 rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2.5 border transition-colors ${
                activeSpeakers.length > 0
                  ? 'bg-[#EC4899]/15 border-[#EC4899]/55 text-white'
                  : 'bg-[#150B28]/80 border-purple-500/20 text-[#A998CC]'
              }`}
            >
              <AudioLines
                className={`w-4 h-4 shrink-0 ${
                  activeSpeakers.length > 0 ? 'text-[#FF4D9D]' : 'text-[#8E7CB5]'
                }`}
              />
              {activeSpeakers.length > 0 ? (
                <span className="truncate">
                  <strong className="text-[#FF88BE]">Hablando ahora:</strong>{' '}
                  {activeSpeakers.map((s) => s.username).join(', ')}
                </span>
              ) : (
                <span className="truncate">
                  Nadie está hablando por micrófono en este momento · Enciende tu micro para hablar
                </span>
              )}
            </div>

            <div className="rounded-2xl bg-[#150B28]/90 border border-purple-500/25 px-3 py-2 flex items-center gap-2 sm:w-52 shrink-0">
              {speakerMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-300 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#C084FC] shrink-0" />
              )}
              <input
                type="range"
                min={0}
                max={100}
                value={speakerMuted ? 0 : volume}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVolume(next);
                  if (next > 0 && speakerMuted) setSpeakerMuted(false);
                }}
                aria-label="Volumen de altavoces"
                className="w-full accent-[#EC4899] cursor-pointer"
              />
              <span className="text-[11px] font-mono-num text-[#C4B5FD] w-8 text-right">
                {speakerMuted ? 0 : volume}%
              </span>
            </div>
          </div>

          {circle.voiceParticipants.length === 0 ? (
            <div className="py-6 text-center text-sm text-[#B8A9D9]">
              El escenario está abierto para personas de cualquier parte del mundo. Toca
              &quot;Micro&quot; abajo para unirte con tu voz.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3.5">
              {circle.voiceParticipants.map((vp) => {
                const isSpeakingNow = !vp.muted && (speakingMap[vp.userId] ?? vp.speaking);
                return (
                  <button
                    key={vp.userId}
                    type="button"
                    onClick={() => {
                      setConfirmBlockParticipant(false);
                      setSelectedParticipant(vp);
                    }}
                    className="flex flex-col items-center text-center group cursor-pointer"
                  >
                    <div className="relative">
                      {isSpeakingNow && (
                        <>
                          <span
                            aria-hidden="true"
                            className="txl-voice-wave-1 absolute inset-0 rounded-full border-2 border-[#EC4899]/80 pointer-events-none"
                          />
                          <span
                            aria-hidden="true"
                            className="txl-voice-wave-2 absolute inset-0 rounded-full border-2 border-[#8B5CF6]/75 pointer-events-none"
                          />
                          <span
                            aria-hidden="true"
                            className="txl-voice-halo absolute -inset-1 rounded-full bg-gradient-to-tr from-[#8B5CF6]/35 to-[#EC4899]/40 blur-sm pointer-events-none"
                          />
                        </>
                      )}

                      <AvatarWithFrame
                        src={vp.avatarUrl}
                        alt={vp.username}
                        frame={vp.frame}
                        frameImageUrl={vp.frameImageUrl}
                        sizeClass="w-16 h-16"
                        ringClass={
                          isSpeakingNow
                            ? 'ring-3 ring-[#EC4899] shadow-[0_0_24px_rgba(236,72,153,0.85)]'
                            : 'ring-2 ring-[#8B5CF6]/75 group-hover:ring-[#EC4899]'
                        }
                      />

                      {vp.handRaised && (
                        <span
                          title="Pidió turno"
                          className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full bg-[#A855F7] border border-white/40 flex items-center justify-center text-white"
                        >
                          <Hand className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full border border-[#1A1025] flex items-center justify-center ${
                          vp.muted
                            ? 'bg-zinc-800 text-zinc-300'
                            : isSpeakingNow
                              ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white'
                              : 'bg-[#8B5CF6] text-white'
                        }`}
                      >
                        {vp.muted ? (
                          <MicOff className="w-3 h-3" />
                        ) : isSpeakingNow ? (
                          <AudioLines className="w-3 h-3" />
                        ) : (
                          <Mic className="w-3 h-3" />
                        )}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-center gap-1 max-w-full">
                      <span className="text-xs font-medium text-white truncate">
                        {vp.username}
                      </span>
                      <VerificationBadge tier={vp.badgeTier} verified={vp.verified} size={13} />
                    </div>

                    {isSpeakingNow ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-gradient-to-r from-[#8B5CF6]/35 to-[#EC4899]/35 border border-[#EC4899] text-[#FF9ECE]">
                        <AudioLines className="w-2.5 h-2.5" />
                        <span>Hablando</span>
                      </span>
                    ) : (
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                          vp.role === 'Admin'
                            ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                            : vp.role === 'Mod'
                              ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                              : 'bg-white/5 border-purple-400/20 text-[#C4B5FD]'
                        }`}
                      >
                        {vp.role === 'Admin' && <Shield className="w-2.5 h-2.5 text-amber-300" />}
                        <span>{vp.role}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ——— REGISTRO DE EVENTOS ——— */}
      {circle.events && circle.events.length > 0 && (
        <section className="relative z-10 space-y-2">
          <h2 className="text-xs font-medium text-[#C4B5FD]">Registro de eventos</h2>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {circle.events.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="rounded-xl bg-[#1A0E30]/90 border border-purple-500/20 px-3.5 py-2 text-xs flex items-center gap-2.5"
              >
                <span
                  className={`font-semibold shrink-0 ${
                    ev.kind === 'gift'
                      ? 'text-[#EC4899]'
                      : ev.kind === 'join'
                        ? 'text-sky-400'
                        : ev.kind === 'create'
                          ? 'text-[#A855F7]'
                          : 'text-[#C4B5FD]'
                  }`}
                >
                  {formatRelativeTime(ev.createdAt, lang)}
                </span>
                <span className="text-[#EDE9FE] truncate">{ev.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— COMPONENTE ROOMCHAT + CONTROLES DE VOZ INFERIORES ——— */}
      <div className="relative z-10 flex-1 flex flex-col justify-between gap-4">
        <div className="sticky bottom-16 lg:bottom-0 z-20 rounded-3xl bg-[#170C2C]/95 backdrop-blur-xl border border-purple-500/25 p-4 space-y-4 shadow-2xl">
          <RoomChat
            messages={circle.messages}
            currentUserId={currentUser.id}
            userCoins={currentUser.coins}
            infiniteCoins={currentUser.role === 'owner' || Boolean(currentUser.infiniteCoins)}
            canModerate={canModerate}
            lang={lang}
            recordingNote={recordingNote}
            recordingSeconds={recordingSeconds}
            sendingMsg={sendingMsg}
            onSendText={handleSendText}
            onSendMedia={handleSendMedia}
            onReactMessage={handleReactMessage}
            onSendGift={handleSendGift}
            onDeleteMessage={handleDeleteMessage}
            onToggleVoiceNote={handleToggleVoiceNote}
          />

          {/* Controles de escenario: Micro / Pedir turno / Salir */}
          <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-purple-500/15">
            <button
              type="button"
              disabled={micToggling}
              onClick={handleToggleMic}
              className={`flex-1 rounded-full py-2.5 px-4 text-xs sm:text-sm font-semibold min-h-[44px] flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 ${
                !isMuted && micActive
                  ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] border border-[#F472B6] text-white shadow-[0_0_24px_rgba(236,72,153,0.6)]'
                  : 'bg-zinc-800/90 border border-zinc-600/60 text-zinc-200 hover:bg-zinc-700/90'
              }`}
            >
              {!isMuted && micActive ? (
                <>
                  {speakingMap[currentUser.id] ? (
                    <AudioLines className="w-4 h-4 text-white" />
                  ) : (
                    <Mic className="w-4 h-4 text-white" />
                  )}
                  <span>{speakingMap[currentUser.id] ? 'Hablando' : 'Micro on'}</span>
                  <span
                    aria-hidden="true"
                    className="w-10 h-1.5 rounded-full bg-black/30 overflow-hidden hidden sm:inline-block"
                  >
                    <span
                      className="block h-full bg-white rounded-full transition-all duration-75"
                      style={{width: `${Math.max(15, micLevel)}%`}}
                    />
                  </span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-zinc-300" />
                  <span>Micro off</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleHand}
              className={`flex-1 rounded-full py-2.5 px-4 text-xs sm:text-sm font-medium min-h-[44px] flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                myParticipant?.handRaised
                  ? 'bg-[#A855F7]/30 border border-[#A855F7] text-white'
                  : 'bg-[#251544] border border-purple-400/30 text-[#E5DBFF] hover:bg-[#311C59]'
              }`}
            >
              <Hand className="w-4 h-4 text-[#E5DBFF]" />
              <span>{myParticipant?.handRaised ? 'Turno pedido' : 'Pedir turno'}</span>
            </button>

            <button
              type="button"
              onClick={handleLeaveVoice}
              aria-label="Salir de la sala de voz"
              className="w-12 h-11 rounded-full bg-rose-500/20 border border-rose-500/60 text-rose-300 hover:bg-rose-500/35 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ——— PARTICIPANT PROFILE & ROLE MODAL ——— */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 text-center">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                aria-label="Cerrar"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center">
              <AvatarWithFrame
                src={selectedParticipant.avatarUrl}
                alt={selectedParticipant.username}
                frame={selectedParticipant.frame}
                frameImageUrl={selectedParticipant.frameImageUrl}
                sizeClass="w-20 h-20"
              />
            </div>

            <div>
              <div className="flex items-center justify-center gap-1.5">
                <h3 className="font-display text-xl font-bold text-white">
                  {selectedParticipant.username}
                </h3>
                <VerificationBadge
                  tier={selectedParticipant.badgeTier}
                  verified={selectedParticipant.verified}
                  size={17}
                />
              </div>
              <p className="text-xs text-[#C4B5FD] mt-1">
                Rol en sala: <strong className="text-white">{selectedParticipant.role}</strong> ·{' '}
                Región: {selectedParticipant.region || 'Global'}
              </p>
              <p className="text-[11px] text-[#A998CC] mt-1">
                Micrófono:{' '}
                <strong className={selectedParticipant.muted ? 'text-rose-300' : 'text-emerald-300'}>
                  {selectedParticipant.muted ? 'Apagado' : 'Encendido'}
                </strong>
              </p>
            </div>

            {selectedParticipant.userId !== currentUser.id && (
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleToggleLocalParticipantMute(selectedParticipant.userId)}
                  className="w-full py-2.5 rounded-full text-xs font-medium bg-[#1D1238] border border-purple-400/35 text-[#E5DBFF] hover:bg-[#2A1950] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {locallyMutedIds.includes(selectedParticipant.userId) ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Escuchar su micrófono</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-rose-300" />
                      <span>Silenciar solo para mí</span>
                    </>
                  )}
                </button>

                {canModerate && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleModerate(selectedParticipant.userId, 'toggle-mute')}
                      className="w-full py-2.5 rounded-full text-xs font-medium bg-[#251544] border border-purple-400/35 text-white hover:bg-[#311C59] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {selectedParticipant.muted ? (
                        <>
                          <Mic className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Prender micrófono</span>
                        </>
                      ) : (
                        <>
                          <MicOff className="w-3.5 h-3.5 text-rose-300" />
                          <span>Apagar micrófono</span>
                        </>
                      )}
                    </button>
                    {selectedParticipant.handRaised && (
                      <button
                        type="button"
                        onClick={() => handleModerate(selectedParticipant.userId, 'lower-hand')}
                        className="w-full py-2.5 rounded-full text-xs font-medium bg-[#251544] border border-purple-400/35 text-white hover:bg-[#311C59] cursor-pointer"
                      >
                        Bajar mano
                      </button>
                    )}
                    {(circle.myRole === 'Admin' || currentUser.role === 'owner') &&
                      selectedParticipant.userId !== circle.adminId && (
                        <button
                          type="button"
                          onClick={() => handleModerate(selectedParticipant.userId, 'toggle-mod')}
                          className="w-full py-2.5 rounded-full text-xs font-medium bg-purple-500/20 border border-purple-400/45 text-purple-100 cursor-pointer"
                        >
                          {selectedParticipant.role === 'Mod'
                            ? 'Quitar Moderador'
                            : 'Ascender a Moderador'}
                        </button>
                      )}
                    {selectedParticipant.userId !== circle.adminId && (
                      <button
                        type="button"
                        onClick={() => handleModerate(selectedParticipant.userId, 'kick')}
                        className="w-full py-2.5 rounded-full text-xs font-medium bg-rose-500/15 border border-rose-400/40 text-rose-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Retirar del escenario</span>
                      </button>
                    )}
                  </>
                )}

                {currentUser.role === 'owner' && (
                  <div className="pt-3 mt-2 border-t border-purple-500/20 space-y-2.5 text-left">
                    <div className="text-[11px] font-semibold text-[#FF88BE] flex items-center gap-1.5">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      <span>Verificables (Solo Dueño)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          {tier: 'owner', label: '⚫ Negra (Dueño)'},
                          {tier: 'moderator', label: '🔵 Azul (Mod)'},
                          {tier: 'influencer', label: '🔴 Roja (Influencer)'},
                          {tier: 'none', label: 'Quitar verificable'},
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.tier}
                          type="button"
                          onClick={() =>
                            handleOwnerAssignBadge(selectedParticipant.userId, opt.tier)
                          }
                          className={`py-2 px-2.5 rounded-xl text-[11px] font-medium border cursor-pointer ${
                            (selectedParticipant.badgeTier || 'none') === opt.tier
                              ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                              : 'bg-[#170B2E] border-purple-400/25 text-[#D8CCF4]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-cyan-200 flex items-center gap-1 mr-auto">
                        <Gem className="w-3.5 h-3.5 text-cyan-300" />
                        Cristales:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOwnerGiftCrystals(selectedParticipant.userId, 25)}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 cursor-pointer"
                      >
                        +25 💎
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOwnerGiftCrystals(selectedParticipant.userId, 100)}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 cursor-pointer"
                      >
                        +100 💎
                      </button>
                    </div>
                  </div>
                )}

                {/* Block participant button (NEVER shown on App Owner) */}
                {!selectedParticipant.isAppOwner && (
                  !confirmBlockParticipant ? (
                    <button
                      type="button"
                      onClick={() => setConfirmBlockParticipant(true)}
                      className="w-full py-2 rounded-full text-xs font-medium bg-rose-500/10 border border-rose-400/30 text-rose-200 hover:bg-rose-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Bloquear usuario</span>
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-rose-950/55 border border-rose-400/45 p-3 space-y-2 text-left">
                      <p className="text-[11px] text-rose-100 leading-relaxed">
                        Dejarás de ver sus mensajes, perfil y escuchar su voz. No recibirá ninguna
                        notificación.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmBlockParticipant(false)}
                          className="py-1.5 rounded-xl text-xs bg-[#1C1033] text-[#D8CCF4] cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleBlockSelectedParticipant}
                          className="py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white cursor-pointer"
                        >
                          Confirmar
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ——— ROOM SETTINGS MODAL (With Custom Room Background Upload & Preview) ——— */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                Configuración de Sala de Voz
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {roomSettingsError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-xs text-rose-200">
                {roomSettingsError}
              </div>
            )}

            <form onSubmit={handleSaveRoomSettings} className="space-y-3.5">
              <div>
                <label className="block text-xs text-[#C4B5FD] mb-1">Nombre de la sala</label>
                <input
                  type="text"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  disabled={circle.myRole !== 'Admin' && currentUser.role !== 'owner'}
                  className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[44px] disabled:opacity-60"
                />
              </div>

              {(circle.myRole === 'Admin' || currentUser.role === 'owner') && (
                <div className="rounded-2xl bg-[#150B29] border border-purple-400/25 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Cambiar fondo de sala</span>
                    <span className="text-[10px] text-[#38BDF8] font-mono-num">
                      1920 × 1080 px rec.
                    </span>
                  </div>

                  <p className="text-[11px] text-[#B8A9D9] leading-relaxed">
                    Formatos permitidos: JPG, PNG o WEBP. No se permiten imágenes con contenido
                    inapropiado. Si se elimina la sala, su fondo también se elimina.
                  </p>

                  {roomBgDraft ? (
                    <div className="relative rounded-xl overflow-hidden border border-[#FF4D9D]/45 aspect-video">
                      <SafeImage
                        src={roomBgDraft}
                        alt="Vista previa del fondo de sala"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-[10px] text-white">
                        Vista previa lista
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-purple-400/30 py-4 text-center text-[11px] text-[#9E8CC4]">
                      Usando el fondo predeterminado de TXLsocial
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      ref={roomBgFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleRoomBgPick}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => roomBgFileRef.current?.click()}
                      className="px-3.5 py-2 rounded-full text-xs font-medium border border-[#FF4D9D]/55 text-[#FF88BE] hover:bg-[#FF4D9D]/10 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{roomBgDraft ? 'Cambiar fondo' : 'Subir fondo'}</span>
                    </button>

                    {roomBgDraft && (
                      <button
                        type="button"
                        onClick={() => setRoomBgDraft(null)}
                        className="px-3.5 py-2 rounded-full text-xs font-medium bg-[#1E1038] border border-purple-400/35 text-[#D8CCF4] hover:border-rose-400/50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar fondo predeterminado</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#C4B5FD] mb-1">
                  Capacidad simultánea de micrófonos ({maxSpeakersInput} voces)
                </label>
                <input
                  type="range"
                  min={30}
                  max={250}
                  step={10}
                  value={maxSpeakersInput}
                  onChange={(e) => setMaxSpeakersInput(Number(e.target.value))}
                  disabled={circle.myRole !== 'Admin' && currentUser.role !== 'owner'}
                  className="w-full accent-[#EC4899]"
                />
                <div className="flex justify-between text-[11px] text-[#9E8CC4] font-mono-num">
                  <span>30 mín.</span>
                  <span>120 global</span>
                  <span>250 máx.</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/35 px-4 py-3 text-xs text-emerald-100">
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>Acceso internacional activo · Sin límite de regiones (mundial)</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-300 shrink-0">Global</span>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-2xl bg-[#150B29] border border-purple-400/20 px-4 py-3 text-xs text-white cursor-pointer">
                <span>Requerir pedir turno para subir al escenario</span>
                <input
                  type="checkbox"
                  checked={handRaiseRequiredInput}
                  onChange={(e) => setHandRaiseRequiredInput(e.target.checked)}
                  disabled={circle.myRole !== 'Admin' && currentUser.role !== 'owner'}
                  className="w-4 h-4 accent-[#EC4899]"
                />
              </label>

              {(circle.myRole === 'Admin' || currentUser.role === 'owner') && (
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="txl-btn-primary w-full rounded-full py-3 text-sm font-semibold min-h-[46px] disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings ? 'Guardando...' : 'Guardar configuración'}
                </button>
              )}
            </form>
          </div>
        </div>
      )}
      {/* ——— SHARE ROOM & MOBILE APP MODAL ——— */}
      <ShareAndInstallModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareRoomUrl}
        shareTitle={`Únete a la sala de voz "${circle.name}" en TXLsocial`}
        lang={lang}
      />
    </div>
  );
}
