import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ChatSession } from '../utils/storage';
import { exportConversations, type ExportFormat } from '../utils/export';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  chat?: ChatSession | null;
  chats?: ChatSession[];
  title?: string;
  theme: 'dark' | 'light';
};

const exportOptions: Array<{ value: ExportFormat; label: string }> = [
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'png', label: 'Image (.png)' },
  { value: 'json', label: 'JSON (.json)' },
];

function ExportModal({ isOpen, onClose, chat, chats, title, theme }: Props) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() => exportOptions.findIndex((option) => option.value === 'markdown'));
  const [dropdownPosition, setDropdownPosition] = useState<CSSProperties | null>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownMenuRef = useRef<HTMLUListElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isLight = theme === 'light';

  const exportItems = chats ?? (chat ? [chat] : []);
  const titleText = title ?? (chats ? 'Export all chats' : chat?.title ?? 'Export conversation');

  useEffect(() => {
    if (!isOpenDropdown) return undefined;

    const calculatePosition = () => {
      const trigger = dropdownTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const maxHeight = 220;
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < maxHeight && spaceAbove > spaceBelow;
      const top = openUp ? undefined : rect.bottom + 6;
      const bottom = openUp ? viewportHeight - rect.top + 6 : undefined;
      setDropdownPosition({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top,
        bottom,
        maxHeight,
        overflowY: 'auto',
        zIndex: 100000,
        boxSizing: 'border-box',
      });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [isOpenDropdown]);

  useEffect(() => {
    if (!isOpenDropdown) return undefined;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownMenuRef.current?.contains(target)
      ) {
        setIsOpenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpenDropdown]);

  if (!isOpen || exportItems.length === 0) return null;

  const modalBgClass = isLight ? 'bg-white' : 'bg-[#0b1220]';
  const modalBorderClass = isLight ? 'border-slate-200' : 'border-slate-700/80';
  const titleClass = isLight ? 'text-slate-900' : 'text-slate-50';
  const subtitleClass = isLight ? 'text-slate-600' : 'text-slate-300';
  const labelClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const buttonBorderClass = isLight ? 'border-slate-200' : 'border-slate-700/80';
  const buttonBgClass = isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100';
  const optionBgClass = isLight ? 'bg-white' : 'bg-slate-900';
  const optionTextClass = isLight ? 'text-slate-900' : 'text-slate-100';
  const optionHoverBgClass = isLight ? 'bg-violet-50' : 'bg-violet-500/20';
  const optionHoverTextClass = isLight ? 'text-violet-800' : 'text-white';
  const borderClass = isLight ? 'border-slate-200' : 'border-slate-700/80';

  const handleDownload = async () => {
    try {
      await exportConversations(exportItems, format);
      onClose();
    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export conversation.');
    }
  };

  const toggleDropdown = () => {
    const selectedIndex = exportOptions.findIndex((option) => option.value === format);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpenDropdown((current) => !current);
  };

  const selectOption = (index: number) => {
    setFormat(exportOptions[index].value);
    setHighlightedIndex(index);
    setIsOpenDropdown(false);
    dropdownTriggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpenDropdown) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setIsOpenDropdown(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % exportOptions.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + exportOptions.length) % exportOptions.length);
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      selectOption(highlightedIndex);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpenDropdown(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/40 p-3" role="dialog" aria-modal="true" aria-labelledby="export-conversation-title">
      <div className={`w-full max-w-[420px] overflow-hidden rounded-2xl border p-4 shadow-lg ${modalBgClass} ${modalBorderClass}`}>
          <h3 id="export-conversation-title" className={`text-sm font-semibold ${titleClass}`}>{titleText}</h3>
          <p className={`mt-2 text-xs ${subtitleClass}`}>{chats ? `${exportItems.length} chats selected for export` : chat?.title}</p>

        <div className="mt-4">
          <label id="export-format-label" htmlFor="export-format-dropdown" className={`block text-[11px] font-medium ${labelClass}`}>Export format</label>
          <div
            className={`relative mt-2 rounded-xl border px-3 py-2 text-sm ${buttonBgClass} ${borderClass} focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/30`}
            ref={containerRef}
            onKeyDown={handleKeyDown}
          >
            <button
              type="button"
              ref={dropdownTriggerRef}
              id="export-format-dropdown"
              aria-haspopup="listbox"
              aria-expanded={isOpenDropdown}
              aria-labelledby="export-format-dropdown export-format-label"
              onClick={toggleDropdown}
              className="flex w-full items-center justify-between gap-3 text-left outline-none"
            >
              <span className={`${optionTextClass}`}>{exportOptions.find((option) => option.value === format)?.label}</span>
              <svg className={`h-4 w-4 shrink-0 transition-transform ${isOpenDropdown ? 'rotate-180' : 'rotate-0'} ${optionTextClass}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M6 8l4 4 4-4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isOpenDropdown && dropdownPosition && createPortal(
              <ul
                ref={dropdownMenuRef}
                role="listbox"
                aria-labelledby="export-format-dropdown"
                aria-activedescendant={`export-format-option-${exportOptions[highlightedIndex]?.value}`}
                tabIndex={-1}
                className={`rounded-xl border ${optionBgClass} ${borderClass} shadow-lg`}
                style={{
                  ...dropdownPosition,
                  padding: 0,
                  margin: 0,
                  listStyle: 'none',
                  scrollbarWidth: 'thin',
                  scrollbarColor: isLight ? 'rgba(148,163,184,0.7) rgba(248,250,252,0.9)' : 'rgba(148,163,184,0.7) rgba(15,23,42,0.9)',
                }}
              >
                {exportOptions.map((option, index) => {
                  const selected = option.value === format;
                  const highlighted = index === highlightedIndex;
                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={selected}
                      id={`export-format-option-${option.value}`}
                      onClick={() => selectOption(index)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`cursor-pointer px-3 py-2 text-[11px] ${optionTextClass} ${highlighted ? `${optionHoverBgClass} ${optionHoverTextClass}` : ''} ${selected && !highlighted ? 'font-semibold' : ''}`}
                    >
                      {option.label}
                    </li>
                  );
                })}
              </ul>,
              document.body,
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${buttonBorderClass} ${buttonBgClass} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/70'}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
