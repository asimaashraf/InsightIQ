import { useEffect, useState, type ReactNode } from 'react';
import { getSettings, saveSettings, getAIKeys, type AIKeys, type Settings } from '../utils/storage';
import { saveProviderApiKey } from '../services/aiService';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
  onSave?: (theme: 'system' | 'dark' | 'light') => void;
};

type SettingsIconName = 'key' | 'download' | 'upload' | 'trash' | 'close';

function SettingsIcon({ name, className = 'h-4 w-4' }: { name: SettingsIconName; className?: string }) {
  const paths: Record<SettingsIconName, ReactNode> = {
    key: (
      <>
        <circle cx="8" cy="15.5" r="3.5" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m10.5 13 8-8m-2.5-1.5 2 2M14.5 7.5l2 2" />
      </>
    ),
    download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" />,
    upload: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V5m0 0 4 4m-4-4L8 9M5 20h14" />,
    trash: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M10 11v5m4-5v5M9 4h6l1 3H8l1-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m6 7 .8 12h10.4L18 7" />
      </>
    ),
    close: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function SettingsModal({ isOpen, onClose, theme = 'dark', onSave }: SettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'groq' | 'gemini'>('groq');
  const [selectedTheme, setSelectedTheme] = useState<'system' | 'dark' | 'light'>('dark');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [savedApiKeys, setSavedApiKeys] = useState<AIKeys>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLight = theme === 'light';
  const primaryTextClass = isLight ? 'text-slate-900' : 'text-slate-50';
  const secondaryTextClass = isLight ? 'text-slate-600' : 'text-slate-400';
  const sectionBorderClass = isLight ? 'border-slate-200' : 'border-slate-800/90';
  const modalClass = isLight
    ? 'border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]'
    : 'border-violet-400/15 bg-[#10172b] shadow-[0_24px_80px_rgba(2,6,23,0.7)]';
  const secondaryButtonClass = isLight
    ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800'
    : 'border-slate-700/80 bg-slate-800/60 text-slate-200 hover:border-violet-400/25 hover:bg-violet-500/10 hover:text-violet-100';

  useEffect(() => {
    if (!isOpen) return undefined;

    const loadTimer = window.setTimeout(() => {
      void Promise.all([getSettings(), getAIKeys()]).then(([loadedSettings, savedApiKeys]) => {
        setSavedApiKeys(savedApiKeys);

        const provider = loadedSettings.selectedProvider ?? loadedSettings.chatProvider ?? 'groq';
        setSelectedProvider(provider);
        setSelectedTheme(loadedSettings.theme ?? 'dark');
        setProviderApiKey(savedApiKeys[provider] ?? '');
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [isOpen]);

  const providerDisplay = {
    openai: { label: 'OpenAI', placeholder: 'Enter your OpenAI API key...' },
    groq: { label: 'Groq', placeholder: 'Enter your Groq API key...' },
    gemini: { label: 'Google Gemini', placeholder: 'Enter your Gemini API key...' },
  } as const;

  const themeOptions = [
    { id: 'system' as const, label: 'System', description: 'Match the browser theme.' },
    { id: 'dark' as const, label: 'Dark', description: 'Use the InsightIQ dark theme.' },
    { id: 'light' as const, label: 'Light', description: 'Use the InsightIQ light theme.' },
  ];

  const handleProviderChange = (provider: 'openai' | 'groq' | 'gemini') => {
    setSelectedProvider(provider);
    setError(null);
    setProviderApiKey('');

    const savedValue = savedApiKeys[provider] ?? '';
    if (savedValue) {
      window.setTimeout(() => setProviderApiKey(savedValue), 0);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setProviderApiKey(value);
  };

  const handleSave = async () => {
    const trimmedKey = providerApiKey.trim();
    if (!trimmedKey) {
      setError('API key is required.');
      return;
    }

    await saveProviderApiKey(selectedProvider, trimmedKey);

    const settingsToSave: Partial<Settings> = {
      selectedProvider,
      theme: selectedTheme,
    };

    if (selectedProvider !== 'openai') {
      settingsToSave.chatProvider = selectedProvider;
    }

    await saveSettings(settingsToSave);
    setSavedApiKeys((previous) => ({ ...previous, [selectedProvider]: trimmedKey }));
    setSaved(true);
    setError(null);
    window.setTimeout(() => setSaved(false), 2000);

    if (typeof onSave === 'function') {
      onSave(selectedTheme);
    }
  };

  if (!isOpen) return null;

  const displayProviders = [
    { id: 'openai' as const, label: 'OpenAI' },
    { id: 'groq' as const, label: 'Groq' },
    { id: 'gemini' as const, label: 'Google Gemini' },
  ];

  const connectionStatus = providerApiKey.trim().length > 0 ? '🟢 Connected' : '⚪ No API key saved';
  const placeholder = providerDisplay[selectedProvider].placeholder;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className={`flex max-h-[calc(100vh-24px)] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border ${modalClass}`}>
          <div className={`flex items-center justify-between border-b px-5 py-4 ${sectionBorderClass}`}>
            <div>
              <h2 id="settings-title" className={`text-base font-semibold tracking-tight ${primaryTextClass}`}>Settings</h2>
              <p className={`mt-1 text-sm ${secondaryTextClass}`}>Customize your InsightIQ workspace</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              }`}
              aria-label="Close settings"
            >
              <SettingsIcon name="close" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="space-y-4">
                <div className={`h-12 animate-pulse rounded-3xl ${isLight ? 'bg-slate-100' : 'bg-slate-800/70'}`} />
                <div className={`h-12 animate-pulse rounded-3xl ${isLight ? 'bg-slate-100' : 'bg-slate-800/70'}`} />
                <div className={`h-44 animate-pulse rounded-3xl ${isLight ? 'bg-slate-100' : 'bg-slate-800/70'}`} />
              </div>
            ) : (
              <>
                <section className="space-y-4">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${primaryTextClass}`}>AI Provider</p>
                    <p className={`mt-2 text-sm ${secondaryTextClass}`}>Choose which AI provider InsightIQ will use.</p>
                  </div>

                  <div className="grid gap-3">
                    {displayProviders.map((provider) => {
                      const selected = selectedProvider === provider.id;
                      const savedKey = savedApiKeys[provider.id] ?? '';
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => handleProviderChange(provider.id)}
                          className={`flex items-center justify-between rounded-3xl border px-4 py-3 text-left transition-colors ${
                            selected
                              ? 'border-violet-400 bg-violet-500/10 text-white shadow-sm'
                              : isLight
                                ? 'border-slate-200 bg-white text-slate-800 hover:border-violet-200 hover:bg-violet-50'
                                : 'border-slate-800 bg-slate-900 text-slate-200 hover:border-violet-400/20 hover:bg-violet-500/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <div className={`h-4 w-4 rounded-full border ${selected ? 'border-violet-500 bg-violet-500' : 'border-slate-500 bg-transparent'}`}>
                                {selected && <span className="block h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <p className="text-sm font-semibold">{provider.label}</p>
                            </div>
                            <p className={`mt-1 text-xs ${selected ? 'text-violet-200' : secondaryTextClass}`}>
                              {savedKey ? 'Connected' : 'No API key saved'}
                            </p>
                          </div>
                          {selected && (
                            <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-violet-500 px-2 text-xs font-semibold text-white">
                              Selected
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className={`mt-5 border-t pt-5 ${sectionBorderClass}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${primaryTextClass}`}>API Key</p>
                  <p className={`mt-2 text-sm ${secondaryTextClass}`}>Enter your API key for the selected provider.</p>

                  <div className="mt-4 space-y-3">
                    <label htmlFor="provider-api-key" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">API Key</label>
                    <input
                      id="provider-api-key"
                      type="password"
                      value={providerApiKey}
                      onChange={(event) => handleApiKeyChange(event.target.value)}
                      placeholder={placeholder}
                      autoComplete="off"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 ${
                        isLight
                          ? 'border-slate-200 bg-white text-slate-900 placeholder-slate-400'
                          : 'border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500'
                      }`}
                    />
                    <p className={`text-sm ${providerApiKey.trim().length > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{connectionStatus}</p>
                    {error && <p className="text-sm text-red-300">{error}</p>}
                  </div>
                </section>

                <section className={`mt-5 border-t pt-5 ${sectionBorderClass}`}>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${primaryTextClass}`}>Appearance</p>
                    <p className={`mt-2 text-sm ${secondaryTextClass}`}>Choose your preferred theme.</p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {themeOptions.map((option) => {
                      const selected = selectedTheme === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedTheme(option.id)}
                          className={`rounded-3xl border px-4 py-3 text-left transition-colors ${
                            selected
                              ? 'border-violet-400 bg-violet-500/10 text-white shadow-sm'
                              : isLight
                                ? 'border-slate-200 bg-white text-slate-800 hover:border-violet-200 hover:bg-violet-50'
                                : 'border-slate-800 bg-slate-900 text-slate-200 hover:border-violet-400/20 hover:bg-violet-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{option.label}</p>
                              <p className={`mt-1 text-xs ${selected ? 'text-violet-200' : secondaryTextClass}`}>{option.description}</p>
                            </div>
                            <div className={`h-4 w-4 rounded-full border ${selected ? 'border-violet-500 bg-violet-500' : 'border-slate-500 bg-transparent'}`}>
                              {selected && <span className="block h-2 w-2 rounded-full bg-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className={`mt-5 border-t pt-5 ${sectionBorderClass}`}>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${primaryTextClass}`}>About InsightIQ</p>
                    <p className={`mt-2 text-sm ${secondaryTextClass}`}>InsightIQ is an AI-powered browser assistant that helps users understand webpages, analyze documents, organize conversations, and improve productivity through intelligent AI assistance.</p>
                  </div>

                  <div className={`mt-4 rounded-3xl border px-4 py-4 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-950'}`}>
                    <p className={`text-sm font-semibold ${primaryTextClass}`}>InsightIQ</p>
                    <p className={`mt-1 text-sm ${secondaryTextClass}`}>AI Browser Assistant</p>
                    <p className={`mt-2 text-sm ${secondaryTextClass}`}>Version 1.0.0</p>
                    <p className={`mt-2 text-sm ${secondaryTextClass}`}><span className={`font-semibold ${primaryTextClass}`}>By Asima Ashraf</span> — <a href="https://github.com/asimaashraf" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:underline">GitHub</a></p>
                  </div>
                </section>
              </>
            )}
          </div>

          <div className={`flex gap-3 border-t px-5 py-4 ${sectionBorderClass}`}>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading}
              className="flex-1 rounded-3xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saved ? 'Saved' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 rounded-3xl border py-3 text-sm font-semibold transition-colors ${secondaryButtonClass}`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default SettingsModal;
