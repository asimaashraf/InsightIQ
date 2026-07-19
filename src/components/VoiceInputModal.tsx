type VoiceInputModalProps = {
  /** Whether the listening overlay is visible. */
  isOpen: boolean;
  /** The current recording duration in whole or fractional seconds. */
  elapsedSeconds: number;
  /** Stops the active voice-recognition session. */
  onCancel: () => void;
  /** Finishes recording and sends the captured voice transcript. */
  onDone: () => void;
  /** Keeps the listening card readable within either application theme. */
  theme?: 'dark' | 'light';
  /** A short live status message, such as "Listening...". */
  status?: string;
  /** Keeps the send button disabled while the transcript is being finalized. */
  isFinishing?: boolean;
};

const WAVEFORM_BARS = [
  { height: 18, delay: '0s' },
  { height: 30, delay: '0.18s' },
  { height: 45, delay: '0.08s' },
  { height: 27, delay: '0.28s' },
  { height: 56, delay: '0.12s' },
  { height: 35, delay: '0.34s' },
  { height: 64, delay: '0.04s' },
  { height: 42, delay: '0.22s' },
  { height: 75, delay: '0.16s' },
  { height: 47, delay: '0.3s' },
  { height: 58, delay: '0.1s' },
  { height: 34, delay: '0.26s' },
  { height: 69, delay: '0.06s' },
  { height: 39, delay: '0.32s' },
  { height: 52, delay: '0.14s' },
  { height: 26, delay: '0.24s' },
  { height: 43, delay: '0.02s' },
] as const;

function formatDuration(elapsedSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function VoiceInputModal({
  isOpen,
  elapsedSeconds,
  onCancel,
  onDone,
  theme = 'dark',
  status = 'Listening...',
  isFinishing = false,
}: VoiceInputModalProps) {
  if (!isOpen) {
    return null;
  }

  const isLight = theme === 'light';
  const overlayClass = isLight ? 'bg-slate-950/25' : 'bg-slate-950/70';
  const cardClass = isLight
    ? 'border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-400/25'
    : 'border-slate-700/80 bg-[#121A2A] text-slate-100 shadow-2xl shadow-black/50';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const cancelClass = isLight
    ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800'
    : 'border-slate-700/70 bg-slate-800/80 text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-violet-100';
  const doneClass = isLight
    ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700'
    : 'bg-violet-500 text-white shadow-sm shadow-violet-950/50 hover:bg-violet-400';

  return (
    <div
      aria-labelledby="voice-input-title"
      aria-modal="true"
      className={`absolute inset-0 z-[80] flex items-center justify-center p-5 backdrop-blur-[2px] ${overlayClass}`}
      role="dialog"
    >
      <section className={`w-full max-w-[292px] rounded-2xl border p-4 ${cardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                isLight
                  ? 'border-violet-200 bg-violet-50 text-violet-700'
                  : 'border-violet-400/30 bg-violet-500/15 text-violet-200'
              }`}
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.75a3 3 0 0 0-3 3v6.5a3 3 0 1 0 6 0v-6.5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M18.5 10.5v1.75a6.5 6.5 0 0 1-13 0V10.5M12 18.75V22M8.75 22h6.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight" id="voice-input-title">
                Voice Input
              </h2>
              <p aria-live="polite" className={`mt-0.5 truncate text-xs font-medium ${mutedClass}`}>
                {status}
              </p>
            </div>
          </div>
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full bg-violet-500 ${isLight ? 'shadow-[0_0_0_4px_rgba(139,92,246,0.12)]' : 'shadow-[0_0_0_4px_rgba(139,92,246,0.18)]'}`}
          />
        </div>

        <div
          aria-label="Animated audio waveform"
          className={`mt-4 flex h-24 items-center justify-center overflow-hidden rounded-xl border px-3 ${
            isLight ? 'border-violet-100 bg-violet-50/70' : 'border-slate-700/70 bg-slate-950/25'
          }`}
        >
          <svg aria-hidden="true" className="h-[76px] w-full" preserveAspectRatio="none" viewBox="0 0 204 76">
            {WAVEFORM_BARS.map((bar, index) => {
              const x = 4 + index * 12.25;
              const barHeight = bar.height * 0.72;
              const y = (76 - barHeight) / 2;

              return (
                <rect
                  fill="currentColor"
                  height={barHeight}
                  key={`${bar.height}-${bar.delay}`}
                  rx="2"
                  width="4.5"
                  x={x}
                  y={y}
                  className={isLight ? 'text-violet-600' : 'text-violet-400'}
                >
                  <animate
                    attributeName="height"
                    begin={bar.delay}
                    calcMode="spline"
                    dur="0.88s"
                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                    repeatCount="indefinite"
                    values={`${Math.max(9, barHeight * 0.46)};${barHeight};${Math.max(9, barHeight * 0.46)}`}
                  />
                  <animate
                    attributeName="y"
                    begin={bar.delay}
                    calcMode="spline"
                    dur="0.88s"
                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                    repeatCount="indefinite"
                    values={`${(76 - Math.max(9, barHeight * 0.46)) / 2};${y};${(76 - Math.max(9, barHeight * 0.46)) / 2}`}
                  />
                </rect>
              );
            })}
          </svg>
        </div>

        <p className={`mt-3 text-center font-mono text-xs font-semibold tabular-nums ${mutedClass}`}>{formatDuration(elapsedSeconds)}</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            aria-busy={isFinishing}
            className={`flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${doneClass} ${
              isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-[#121A2A]'
            }`}
            disabled={isFinishing}
            onClick={onDone}
            type="button"
          >
            {isFinishing ? 'Sending...' : 'Done & send'}
          </button>
          <button
            className={`flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${cancelClass} ${
              isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-[#121A2A]'
            }`}
            disabled={isFinishing}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export default VoiceInputModal;
export type { VoiceInputModalProps };
