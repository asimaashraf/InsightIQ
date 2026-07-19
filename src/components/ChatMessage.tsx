import { useEffect, useState, type ReactNode } from 'react';
import type { Message } from '../types/chat';

type ChatMessageProps = {
  message: Message;
  theme?: 'dark' | 'light';
  /** Called with the assistant message that should be regenerated. */
  onRegenerate?: (message: Message) => void | Promise<void>;
};

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'callout'; kind: 'tip' | 'expected-output'; content: string }
  | { type: 'code'; content: string; language?: string };

const inlineMarkdownPattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function languageLabel(language?: string): string {
  if (!language) return 'Code';
  const labels: Record<string, string> = {
    js: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'React TSX',
    py: 'Python', rb: 'Ruby', sh: 'Shell', bash: 'Bash', html: 'HTML',
    css: 'CSS', json: 'JSON', sql: 'SQL', java: 'Java', csharp: 'C#',
    cpp: 'C++', c: 'C', go: 'Go', php: 'PHP', yaml: 'YAML', yml: 'YAML',
  };
  return labels[language.toLowerCase()] || language;
}

function syntaxHighlight(code: string, language?: string): ReactNode[] {
  const normalizedLanguage = language?.toLowerCase();
  if (!normalizedLanguage || ['text', 'txt', 'plaintext'].includes(normalizedLanguage)) return [code];

  const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->|`[^`]*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|new|throw|try|catch|finally|def|print|True|False|None|public|private|static|void|int|string|boolean|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b|\b\d+(?:\.\d+)?\b)/gi;
  const tokens: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = tokenPattern.exec(code)) !== null) {
    if (match.index > cursor) tokens.push(code.slice(cursor, match.index));
    const token = match[0];
    let tokenClass = 'text-slate-100';
    if (/^(\/\/|\/\*|#|<!--)/.test(token)) tokenClass = 'text-emerald-300/85';
    else if (/^['"`]/.test(token)) tokenClass = 'text-amber-200';
    else if (/^\d/.test(token)) tokenClass = 'text-cyan-300';
    else tokenClass = 'text-violet-300';
    tokens.push(<span className={tokenClass} key={`syntax-${tokenIndex}`}>{token}</span>);
    cursor = match.index + token.length;
    tokenIndex += 1;
  }

  if (cursor < code.length) tokens.push(code.slice(cursor));
  return tokens;
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const value = paragraph.join('\n').trim();
    if (value) {
      blocks.push({ type: 'paragraph', content: value });
    }
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const codeFence = line.match(/^```\s*([^\s`]*)\s*$/);

    if (codeFence) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language: codeFence[1] || undefined,
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const headingContent = heading[2].trim().toLowerCase().replace(/:$/, '');
      const calloutKind = headingContent === 'tip' || headingContent === 'tips'
        ? 'tip'
        : headingContent === 'expected output' || headingContent === 'output'
          ? 'expected-output'
          : undefined;

      if (calloutKind) {
        const calloutLines: string[] = [];
        index += 1;
        while (index < lines.length && !/^(#{1,6})\s+/.test(lines[index]) && !/^```/.test(lines[index])) {
          calloutLines.push(lines[index]);
          index += 1;
        }
        index -= 1;
        blocks.push({ type: 'callout', kind: calloutKind, content: calloutLines.join('\n').trim() });
        continue;
      }

      blocks.push({
        type: 'heading',
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        content: heading[2],
      });
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      const items: string[] = [unorderedItem[1]];

      while (index + 1 < lines.length) {
        const nextItem = lines[index + 1].match(/^\s*[-*+]\s+(.+)$/);
        if (!nextItem) {
          break;
        }
        items.push(nextItem[1]);
        index += 1;
      }

      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      const items: string[] = [orderedItem[1]];

      while (index + 1 < lines.length) {
        const nextItem = lines[index + 1].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!nextItem) {
          break;
        }
        items.push(nextItem[1]);
        index += 1;
      }

      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function renderInlineMarkdown(content: string, isLight: boolean): ReactNode[] {
  return content.split(inlineMarkdownPattern).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          className={`rounded px-1.5 py-0.5 font-mono text-[0.82em] ${
            isLight ? 'bg-violet-50 text-violet-900' : 'bg-slate-950/70 text-violet-100'
          }`}
          key={`code-${index}`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}

function MarkdownContent({ content, isLight, isUser }: { content: string; isLight: boolean; isUser: boolean }) {
  const blocks = parseMarkdown(content);
  const codeBlockClass = isUser
    ? 'border border-white/15 bg-slate-950/25 text-white'
    : isLight
      ? 'border border-slate-200 bg-slate-950 text-slate-100 shadow-sm'
      : 'border border-slate-700/80 bg-slate-950/80 text-slate-100 shadow-sm';

  return (
    <div className="space-y-3.5 break-words">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const headingClass =
              block.level === 1
                ? 'text-[15px] font-semibold tracking-tight'
                : block.level === 2
                  ? 'text-sm font-semibold'
                  : 'text-[13px] font-semibold';

            return (
              <h3 className={headingClass} key={`heading-${index}`}>
                {renderInlineMarkdown(block.content, isLight)}
              </h3>
            );
          }

          case 'unordered-list':
            return (
              <ul className="list-disc space-y-1.5 pl-5 marker:text-violet-400" key={`unordered-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`unordered-item-${itemIndex}`}>{renderInlineMarkdown(item, isLight)}</li>
                ))}
              </ul>
            );

          case 'ordered-list':
            return (
              <ol className="list-decimal space-y-1.5 pl-5 marker:text-violet-400" key={`ordered-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`ordered-item-${itemIndex}`}>{renderInlineMarkdown(item, isLight)}</li>
                ))}
              </ol>
            );

          case 'table':
            return (
              <div className={`overflow-x-auto rounded-xl border ${isUser ? 'border-white/15' : isLight ? 'border-slate-200 bg-white' : 'border-slate-700/80 bg-slate-950/30'}`} key={`table-${index}`}>
                <table className="min-w-full border-collapse text-left text-xs leading-5">
                  <thead className={isUser ? 'bg-white/10' : isLight ? 'bg-slate-50 text-slate-700' : 'bg-slate-800/80 text-slate-200'}>
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th className="whitespace-nowrap border-b border-inherit px-3 py-2 font-semibold" key={`table-header-${headerIndex}`}>
                          {renderInlineMarkdown(header, isLight)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr className={isLight ? 'border-t border-slate-100' : 'border-t border-slate-800/80'} key={`table-row-${rowIndex}`}>
                        {block.headers.map((_, cellIndex) => (
                          <td className="px-3 py-2 align-top" key={`table-cell-${rowIndex}-${cellIndex}`}>
                            {renderInlineMarkdown(row[cellIndex] || '', isLight)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'callout': {
            const isTip = block.kind === 'tip';
            const label = isTip ? 'Tip' : 'Expected Output';
            const icon = isTip ? '✦' : '↳';
            return (
              <aside
                className={`rounded-xl border px-3 py-2.5 text-xs leading-5 ${
                  isUser
                    ? 'border-white/15 bg-white/10'
                    : isTip
                      ? isLight
                        ? 'border-amber-200 bg-amber-50 text-amber-950'
                        : 'border-amber-400/20 bg-amber-400/5 text-amber-100'
                      : isLight
                        ? 'border-cyan-200 bg-cyan-50 text-slate-800'
                        : 'border-cyan-400/20 bg-cyan-400/5 text-slate-100'
                }`}
                key={`callout-${index}`}
              >
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                  <span aria-hidden="true">{icon}</span>{label}
                </p>
                <div className="whitespace-pre-wrap">{renderInlineMarkdown(block.content, isLight)}</div>
              </aside>
            );
          }

          case 'code':
            return (
              <div className={`overflow-hidden rounded-xl text-xs shadow-md shadow-slate-950/10 ${codeBlockClass}`} key={`code-block-${index}`}>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-100">Code example</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Review this {languageLabel(block.language)} snippet before using it.</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-violet-300/20 bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-violet-200">
                    {languageLabel(block.language)}
                  </span>
                </div>
                <pre className="max-w-full overflow-x-auto p-3.5 font-mono text-[11px] leading-6 [scrollbar-color:theme(colors.violet.500)_transparent]">
                  <code>{syntaxHighlight(block.content, block.language)}</code>
                </pre>
              </div>
            );

          case 'paragraph':
            return (
              <p className="whitespace-pre-wrap" key={`paragraph-${index}`}>
                {renderInlineMarkdown(block.content, isLight)}
              </p>
            );
        }
      })}
    </div>
  );
}

async function copyToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = content;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();

  if (!copied) {
    throw new Error('Unable to copy this response.');
  }
}

function ChatMessage({ message, theme = 'dark', onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isLight = theme === 'light';
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(message.content);
      setCopied(true);
    } catch (error) {
      console.error('Failed to copy AI response:', error);
    }
  };

  return (
    <div className={`flex min-w-0 gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-600 shadow-sm shadow-violet-950/20">
          <span className="text-[10px] font-bold tracking-tight text-white">IQ</span>
        </div>
      )}

      <div className={`flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        { /* Generated image message */ }
        {('type' in message) && (message as any).type === 'generated-image' ? (
          <div className={`w-fit max-w-full rounded-2xl border px-3.5 py-3 text-[13px] leading-6 shadow-sm ${isLight ? 'rounded-bl-md border-slate-200 bg-white text-slate-800 shadow-slate-200/60' : 'rounded-bl-md border-slate-700/70 bg-slate-900/90 text-slate-100 shadow-slate-950/20'}`}>
            <div className="flex flex-col gap-3">
              <img src={(message as any).imageUrl} alt={(message as any).prompt} className="max-w-[360px] rounded-lg object-cover" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Generated image</p>
                  <p className="text-[11px] text-slate-500">{(message as any).prompt}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Generated image</p>
                </div>
                <div className="flex items-center gap-2">
                  <button aria-label="Download image" title="Download image" onClick={() => { const a = document.createElement('a'); a.href = (message as any).imageUrl; a.download = 'insightiq-image.jpg'; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); }} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${isLight ? 'text-slate-600 hover:bg-white hover:text-violet-700' : 'text-slate-400 hover:bg-slate-800 hover:text-violet-200'}`}>
                    Download
                  </button>
                  <button aria-label="Regenerate image" title="Regenerate image" onClick={() => onRegenerate?.(message)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${isLight ? 'text-slate-600 hover:bg-white hover:text-violet-700' : 'text-slate-400 hover:bg-slate-800 hover:text-violet-200'}`}>
                    Regenerate
                  </button>
                  <button aria-label="Copy prompt" title="Copy prompt" onClick={async () => { try { await copyToClipboard((message as any).prompt); setCopied(true); } catch { /* noop */ } }} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${isLight ? 'text-slate-600 hover:bg-white hover:text-violet-700' : 'text-slate-400 hover:bg-slate-800 hover:text-violet-200'}`}>
                    {copied ? 'Copied' : 'Copy prompt'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`w-fit max-w-full rounded-2xl border px-3.5 py-3 text-[13px] leading-6 shadow-sm ${
              isUser
                ? isLight
                  ? 'rounded-br-md border-violet-600 bg-violet-600 text-white shadow-violet-200/50'
                  : 'rounded-br-md border-violet-400/20 bg-violet-500/20 text-slate-50 shadow-slate-950/20'
                : isLight
                  ? 'rounded-bl-md border-slate-200 bg-white text-slate-800 shadow-slate-200/60'
                  : 'rounded-bl-md border-slate-700/70 bg-slate-900/90 text-slate-100 shadow-slate-950/20'
            }`}
          >
            <MarkdownContent content={message.content} isLight={isLight} isUser={isUser} />
          </div>
        )}

        {!isUser && (
          <div
            className={`mt-2 flex items-center gap-0.5 rounded-lg border p-0.5 ${
              isLight ? 'border-slate-200 bg-slate-50/90' : 'border-slate-800 bg-slate-950/30'
            }`}
          >
            <button
              aria-label="Copy AI response"
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                isLight
                  ? 'text-slate-600 hover:bg-white hover:text-violet-700'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-violet-200'
              }`}
              onClick={() => void handleCopy()}
              type="button"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onRegenerate && (
              <button
                aria-label="Regenerate AI response"
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  isLight
                    ? 'text-slate-600 hover:bg-white hover:text-violet-700'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-violet-200'
                }`}
                onClick={() => {
                  void onRegenerate(message);
                }}
                type="button"
              >
                Regenerate
              </button>
            )}
          </div>
        )}

        <span className={`mt-1.5 px-1 text-[10px] font-medium tabular-nums ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default ChatMessage;
