type SpeechRecognitionOutcome =
  | { ok: true; transcript: string }
  | { ok: false; error: string; cancelled?: boolean };

export type SpeechRecognitionSession = {
  transcript: Promise<string>;
  /** Finish recording and resolve with everything spoken so far. */
  finish: () => Promise<void>;
  /** Discard the current recording without sending it. */
  cancel: () => Promise<void>;
};

export class SpeechRecognitionCancelledError extends Error {
  constructor() {
    super('Voice input was cancelled.');
    this.name = 'SpeechRecognitionCancelledError';
  }
}

/**
 * Runs speech recognition in the active webpage, where Chrome grants the
 * microphone permission. The returned controller lets the popup stop the
 * same recognition session when the user selects Done & send or Cancel.
 */
export async function startSpeechRecognition(): Promise<SpeechRecognitionSession> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) {
    throw new Error('Open a normal website before using voice input. Chrome internal pages cannot request microphone access.');
  }

  const tabId = tab.id;
  const sessionId = `insightiq-voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let cancellationRequested = false;

  const transcript = chrome.scripting.executeScript({
    target: { tabId },
    func: recognizeSpeechInPage,
    args: [sessionId],
  }).then(async ([result]) => {
    const outcome = await result?.result;
    if (!outcome?.ok) {
      if (cancellationRequested || outcome?.cancelled) {
        throw new SpeechRecognitionCancelledError();
      }
      throw new Error(outcome?.error || 'Voice input could not start. Allow microphone access for the current website and try again.');
    }
    return outcome.transcript;
  });

  return {
    transcript,
    finish: async () => {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: finishSpeechRecognitionInPage,
        args: [sessionId],
      });
    },
    cancel: async () => {
      cancellationRequested = true;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: cancelSpeechRecognitionInPage,
          args: [sessionId],
        });
      } catch (error) {
        // The page may have navigated while the recognition session was open.
        // The session promise will still surface a readable result to the popup.
        console.warn('[InsightIQ] Could not send the voice cancellation request:', error);
      }
    },
  };
}

function recognizeSpeechInPage(sessionId: string): Promise<SpeechRecognitionOutcome> {
  type Recognition = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
  type RecognitionConstructor = new () => Recognition;
  type VoiceSessionControls = {
    cancel: () => void;
    finish: () => void;
  };
  type VoiceRegistry = {
    sessions: Map<string, VoiceSessionControls>;
    cancelled: Set<string>;
    finishRequested: Set<string>;
  };

  const pageWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
    __insightiqVoiceRecognitionRegistry?: VoiceRegistry;
  };
  const registry = pageWindow.__insightiqVoiceRecognitionRegistry
    || (pageWindow.__insightiqVoiceRecognitionRegistry = { sessions: new Map(), cancelled: new Set(), finishRequested: new Set() });

  if (registry.cancelled.delete(sessionId)) {
    return Promise.resolve({ ok: false, error: 'Voice input was cancelled.', cancelled: true });
  }
  const finishWasRequested = registry.finishRequested.delete(sessionId);

  return new Promise((resolve) => {
    const RecognitionApi = pageWindow.SpeechRecognition || pageWindow.webkitSpeechRecognition;
    if (!RecognitionApi) {
      resolve({ ok: false, error: 'Speech recognition is not available in this Chrome page.' });
      return;
    }

    const recognition = new RecognitionApi();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let completed = false;
    let finishRequested = false;
    let finalTranscript = '';
    let interimTranscript = '';
    const timeoutRef: { current?: number } = {};
    const finishTimeoutRef: { current?: number } = {};

    const finish = (outcome: SpeechRecognitionOutcome) => {
      if (completed) return;
      completed = true;
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
      if (finishTimeoutRef.current !== undefined) window.clearTimeout(finishTimeoutRef.current);
      registry.sessions.delete(sessionId);
      registry.cancelled.delete(sessionId);
      registry.finishRequested.delete(sessionId);
      resolve(outcome);
    };

    const resolveCollectedSpeech = () => {
      const transcript = `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, ' ').trim();
      if (transcript) {
        finish({ ok: true, transcript });
        return;
      }
      finish({ ok: false, error: 'No speech was detected. Please speak, then select Done & send.' });
    };

    const cancel = () => {
      finish({ ok: false, error: 'Voice input was cancelled.', cancelled: true });
      recognition.stop();
    };

    const requestFinish = () => {
      if (completed || finishRequested) return;
      finishRequested = true;
      try {
        recognition.stop();
      } catch {
        resolveCollectedSpeech();
        return;
      }
      if (!completed) {
        finishTimeoutRef.current = window.setTimeout(resolveCollectedSpeech, 2500);
      }
    };

    registry.sessions.set(sessionId, { cancel, finish: requestFinish });
    timeoutRef.current = window.setTimeout(() => {
      finish({ ok: false, error: 'Voice input reached the 2-minute limit. Please select Done & send before the timer ends.' });
      recognition.stop();
    }, 120000);

    recognition.onresult = (event) => {
      if (completed) return;

      const resultEntries = Array.from(event.results).slice(event.resultIndex);
      const finalParts: string[] = [];
      const interimParts: string[] = [];

      resultEntries.forEach((result) => {
        const text = result[0]?.transcript?.trim();
        if (!text) return;
        if (result.isFinal) {
          finalParts.push(text);
        } else {
          interimParts.push(text);
        }
      });

      if (finalParts.length > 0) {
        finalTranscript = `${finalTranscript} ${finalParts.join(' ')}`.trim();
      }
      interimTranscript = interimParts.join(' ').trim();
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        finish({ ok: false, error: 'Microphone was blocked for this website. Click the lock icon in the address bar, set Microphone to Allow, refresh the webpage, then try again.' });
        return;
      }
      if (event.error === 'no-speech' && finishRequested) {
        resolveCollectedSpeech();
        return;
      }
      if (event.error === 'no-speech') {
        return;
      }
      finish({ ok: false, error: `Speech recognition error: ${event.error}` });
    };

    recognition.onend = () => {
      if (completed) return;
      if (finishRequested) {
        resolveCollectedSpeech();
        return;
      }

      // Chrome can end a continuous recognition session after a short pause.
      // Restart it so the user remains in control until Done & send is pressed.
      try {
        recognition.start();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        finish({ ok: false, error: `Speech recognition stopped unexpectedly: ${reason}` });
      }
    };

    try {
      recognition.start();
      if (finishWasRequested) requestFinish();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      finish({ ok: false, error: `Could not start speech recognition: ${reason}` });
    }
  });
}

function cancelSpeechRecognitionInPage(sessionId: string): boolean {
  type VoiceSessionControls = {
    cancel: () => void;
    finish: () => void;
  };
  type VoiceRegistry = {
    sessions: Map<string, VoiceSessionControls>;
    cancelled: Set<string>;
    finishRequested: Set<string>;
  };

  const pageWindow = window as Window & { __insightiqVoiceRecognitionRegistry?: VoiceRegistry };
  const registry = pageWindow.__insightiqVoiceRecognitionRegistry
    || (pageWindow.__insightiqVoiceRecognitionRegistry = { sessions: new Map(), cancelled: new Set(), finishRequested: new Set() });
  registry.cancelled.add(sessionId);
  registry.finishRequested.delete(sessionId);

  const session = registry.sessions.get(sessionId);
  if (!session) return false;

  session.cancel();
  return true;
}

function finishSpeechRecognitionInPage(sessionId: string): boolean {
  type VoiceSessionControls = {
    cancel: () => void;
    finish: () => void;
  };
  type VoiceRegistry = {
    sessions: Map<string, VoiceSessionControls>;
    cancelled: Set<string>;
    finishRequested: Set<string>;
  };

  const pageWindow = window as Window & { __insightiqVoiceRecognitionRegistry?: VoiceRegistry };
  const registry = pageWindow.__insightiqVoiceRecognitionRegistry
    || (pageWindow.__insightiqVoiceRecognitionRegistry = { sessions: new Map(), cancelled: new Set(), finishRequested: new Set() });
  registry.finishRequested.add(sessionId);

  const session = registry.sessions.get(sessionId);
  if (!session) return false;

  session.finish();
  return true;
}

export async function captureScreenshot(): Promise<string> {
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise((resolve) => (video.onloadedmetadata = resolve));
    await video.play();

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = video.videoWidth;
    imageCanvas.height = video.videoHeight;
    const ctx = imageCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
    }

    return imageCanvas.toDataURL('image/png');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to capture screenshot: ${reason}`, { cause: error });
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export async function captureCurrentTabScreenshot(): Promise<File> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: 'image/png' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not capture the current tab: ${reason}`, { cause: error });
  }
}

export async function readClipboard(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read clipboard: ${reason}`, { cause: error });
  }
}

export async function readFileAsText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const content = await (await pdf.getPage(index + 1)).getTextContent();
      return content.items.map((item) => item.str || '').join(' ');
    }));
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error(`"${file.name}" does not contain selectable text. It may be a scanned image PDF.`);
    return text;
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!result.value.trim()) throw new Error(`"${file.name}" does not contain readable document text.`);
    return result.value;
  }

  const isTextFile = file.type.startsWith('text/') || /\.(txt|md|csv|json|xml|html?)$/i.test(file.name);
  if (!isTextFile) throw new Error(`"${file.name}" is an image or unsupported binary format. Its preview is attached, but only text, PDF, and DOCX files can be explained.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function validateFileType(file: File): boolean {
  const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  return allowedTypes.includes(file.type) || file.name.match(/\.(pdf|docx|txt|csv|png|jpg|jpeg|gif|webp)$/i) !== null;
}
