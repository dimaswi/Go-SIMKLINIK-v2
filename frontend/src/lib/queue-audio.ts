const AUDIO_BASE_PATH = "/audio1";

const AUDIO_FILES = {
  in: `${AUDIO_BASE_PATH}/in.wav`,
  out: `${AUDIO_BASE_PATH}/out.wav`,
  nomorUrut: `${AUDIO_BASE_PATH}/nomor-urut.wav`,
  loket: `${AUDIO_BASE_PATH}/loket.wav`,
  belas: `${AUDIO_BASE_PATH}/belas.wav`,
  puluh: `${AUDIO_BASE_PATH}/puluh.wav`,
  ratus: `${AUDIO_BASE_PATH}/ratus.wav`,
  sepuluh: `${AUDIO_BASE_PATH}/sepuluh.wav`,
  sebelas: `${AUDIO_BASE_PATH}/sebelas.wav`,
  seratus: `${AUDIO_BASE_PATH}/seratus.wav`,
} as const;

let sharedAudio: HTMLAudioElement | null = null;

const getSharedAudio = () => {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }

  return sharedAudio;
};

const playSingleAudio = (src: string, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const audio = getSharedAudio();

    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      audio.pause();
      audio.currentTime = 0;
      cleanup();
      resolve();
    };

    if (signal?.aborted) {
      resolve();
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;
    audio.src = src;
    audio.load();

    audio.onended = () => {
      cleanup();
      resolve();
    };

    audio.onerror = () => {
      cleanup();
      reject(new Error(`Failed to play audio: ${src}`));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    void audio.play().catch((error) => {
      cleanup();
      reject(error);
    });
  });

export const unlockQueueAudio = async () => {
  let audioUnlocked = false;
  try {
    const audio = getSharedAudio();
    audio.src = AUDIO_FILES.in;
    audio.muted = true;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audioUnlocked = true;
  } catch {
    audioUnlocked = false;
  } finally {
    const audio = getSharedAudio();
    audio.muted = false;
    audio.volume = 1;
  }

  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance("siap");
      utterance.lang = "id-ID";
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Ignore speech unlock errors
  }

  return audioUnlocked;
};

export const playQueueAudioFeedback = async (type: "in" | "out" = "in", signal?: AbortSignal) => {
  await playSingleAudio(type === "in" ? AUDIO_FILES.in : AUDIO_FILES.out, signal);
};
