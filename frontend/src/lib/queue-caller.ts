import { queueApi, type QueueCall } from '@/lib/api';
import { playQueueAudioFeedback, unlockQueueAudio } from '@/lib/queue-audio';

export { playQueueAudioFeedback, unlockQueueAudio };

const CHANNEL_NAME = 'simklinik_queue_call';
const STORAGE_EVENT_KEY = 'simklinik_queue_call_event';
const CLIP_GAP_MS = 500;
const SPEECH_RATE = 0.84;
const SPEECH_PITCH = 1;
const SPEECH_VOLUME = 1;

const INDONESIAN_VOICE_NAME_PRIORITY = [
  'Google Bahasa Indonesia',
  'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)',
  'Microsoft Gadis',
  'Bahasa Indonesia',
  'Indonesian',
  'id-ID',
];

const INDONESIAN_SPEECH_MAP: Record<string, string> = {
  A: 'a',
  B: 'be',
  C: 'ce',
  D: 'de',
  E: 'e',
  F: 'ef',
  G: 'ge',
  H: 'ha',
  I: 'i',
  J: 'je',
  K: 'ka',
  L: 'el',
  M: 'em',
  N: 'en',
  O: 'o',
  P: 'pe',
  Q: 'kiu',
  R: 'er',
  S: 'es',
  T: 'te',
  U: 'u',
  V: 've',
  W: 'we',
  X: 'eks',
  Y: 'ye',
  Z: 'zet',
  '0': 'nol',
  '1': 'satu',
  '2': 'dua',
  '3': 'tiga',
  '4': 'empat',
  '5': 'lima',
  '6': 'enam',
  '7': 'tujuh',
  '8': 'delapan',
  '9': 'sembilan',
};

let speechChain: Promise<void> = Promise.resolve();

const waitDelay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function getPreferredIndonesianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const indonesianVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith('id')
  );
  if (indonesianVoices.length === 0) return null;

  const sortedVoices = [...indonesianVoices].sort((left, right) => {
    const leftIndex = INDONESIAN_VOICE_NAME_PRIORITY.findIndex(
      (keyword) =>
        left.name.toLowerCase().includes(keyword.toLowerCase()) ||
        left.voiceURI.toLowerCase().includes(keyword.toLowerCase())
    );
    const rightIndex = INDONESIAN_VOICE_NAME_PRIORITY.findIndex(
      (keyword) =>
        right.name.toLowerCase().includes(keyword.toLowerCase()) ||
        right.voiceURI.toLowerCase().includes(keyword.toLowerCase())
    );
    const leftScore = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightScore = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftScore !== rightScore) return leftScore - rightScore;
    if (left.default !== right.default) return left.default ? -1 : 1;
    if (left.localService !== right.localService) return left.localService ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  return sortedVoices[0] || null;
}

export function formatQueueDigitsForSpeech(queueNumber: number) {
  return String(queueNumber)
    .padStart(3, '0')
    .split('')
    .map((digit) => INDONESIAN_SPEECH_MAP[digit] || digit)
    .join(' ');
}

function speakUtteranceAsync(text: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        synth.cancel();
      }
      const preferredVoice = getPreferredIndonesianVoice();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = preferredVoice?.lang || 'id-ID';
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.rate = SPEECH_RATE;
      utterance.pitch = SPEECH_PITCH;
      utterance.volume = SPEECH_VOLUME;

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      utterance.onend = done;
      utterance.onerror = done;
      // Fallback safety timeout so the chain never stalls on browsers without speech callbacks
      window.setTimeout(done, 12000);
      synth.speak(utterance);
    } catch {
      resolve();
    }
  });
}

async function runBellAndSpeechSequence(
  call: Pick<QueueCall, 'queue_number' | 'destination_name'>
) {
  if (typeof window === 'undefined') return;

  const numText = formatQueueDigitsForSpeech(call.queue_number);
  const message = `Nomor antrian, ${numText}, silakan menuju ${call.destination_name}.`;

  try {
    await playQueueAudioFeedback('in');
  } catch {
    // Ignore autoplay errors until user unlocks audio
  }

  await waitDelay(CLIP_GAP_MS);
  await speakUtteranceAsync(message);
  await waitDelay(CLIP_GAP_MS);

  try {
    await playQueueAudioFeedback('out');
  } catch {
    // Ignore autoplay errors
  }
}

export function speakQueueCall(
  call: Pick<QueueCall, 'queue_number' | 'destination_name'> & { patient_name?: string }
) {
  if (typeof window === 'undefined') return;
  speechChain = speechChain
    .then(() => runBellAndSpeechSequence(call))
    .catch(() => {});
}

function dispatchCallToDisplay(call: QueueCall) {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(call);
    channel.close();
  }
  try {
    localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify({ ...call, _ts: Date.now() }));
  } catch {
    // Ignore storage error
  }
}

export async function announceQueueCall(payload: {
  queueNumber: number;
  patientName?: string;
  unitType: 'pendaftaran' | 'kasir' | 'poliklinik' | 'farmasi' | 'laboratorium' | 'radiologi' | 'ruangan';
  destinationName: string;
}) {
  const localCall: Pick<QueueCall, 'queue_number' | 'patient_name' | 'unit_type' | 'destination_name'> = {
    queue_number: payload.queueNumber,
    patient_name: payload.patientName || '',
    unit_type: payload.unitType,
    destination_name: payload.destinationName,
  };

  try {
    const res = await queueApi.call({
      queue_number: payload.queueNumber,
      patient_name: payload.patientName || '',
      unit_type: payload.unitType,
      destination_name: payload.destinationName,
    });
    const saved = res.data?.data;
    if (saved) {
      dispatchCallToDisplay(saved);
    }
    return saved;
  } catch {
    dispatchCallToDisplay({ ...localCall, id: Date.now(), created_at: new Date().toISOString() });
    return null;
  }
}

export function subscribeQueueCallBroadcast(onCall: (call: QueueCall) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data) {
        onCall(event.data as QueueCall);
      }
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as QueueCall;
      if (parsed && parsed.queue_number) {
        onCall(parsed);
      }
    } catch {
      // Ignore malformed JSON
    }
  };

  window.addEventListener('storage', handleStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}
