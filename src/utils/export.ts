import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import type { ChatSession } from './storage';

export type ExportFormat = 'pdf' | 'docx' | 'png' | 'markdown' | 'json';

function timestamp(value: Date | string): string {
  return new Date(value).toLocaleString();
}

function markdown(chats: ChatSession[]): string {
  return ['# InsightIQ conversation export', `Exported: ${timestamp(new Date())}`, '', ...chats.flatMap((chat) => [
    `## ${chat.title}`,
    `Started: ${timestamp(chat.createdAt)}`,
    '',
    ...chat.messages.flatMap((message) => [`### ${message.role === 'user' ? 'You' : 'InsightIQ'} · ${timestamp(message.timestamp)}`, '', message.content, '']),
  ])].join('\n');
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportConversations(chats: ChatSession[], format: ExportFormat): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    download(new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' }), `insightiq-chats-${stamp}.json`);
    return;
  }

  const content = markdown(chats);
  if (format === 'markdown') {
    download(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `insightiq-chats-${stamp}.md`);
    return;
  }

  if (format === 'png') {
    const canvas = document.createElement('canvas');
    const width = 1400;
    const lineHeight = 28;
    const lines = content.split('\n').flatMap((line) => {
      const words = line.split(' ');
      const wrapped: string[] = [];
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > 92) { wrapped.push(current); current = word; } else current = next;
      }
      if (current || !wrapped.length) wrapped.push(current);
      return wrapped;
    });
    canvas.width = width;
    canvas.height = Math.max(360, lines.length * lineHeight + 100);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create PNG export.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#172033';
    context.font = '20px Arial, sans-serif';
    lines.forEach((line, index) => context.fillText(line, 48, 56 + index * lineHeight));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create PNG export.')), 'image/png'));
    download(blob, `insightiq-chats-${stamp}.png`);
    return;
  }

  if (format === 'pdf') {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 44;
    const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    let y = margin;
    pdf.setFontSize(18);
    pdf.text('InsightIQ conversation export', margin, y);
    y += 28;
    pdf.setFontSize(10);
    for (const line of pdf.splitTextToSize(content, pageWidth)) {
      if (y > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += 14;
    }
    pdf.save(`insightiq-chats-${stamp}.pdf`);
    return;
  }

  const children = chats.flatMap((chat) => [
    new Paragraph({ text: chat.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `Started: ${timestamp(chat.createdAt)}`, italics: true })] }),
    ...chat.messages.flatMap((message) => [
      new Paragraph({ text: `${message.role === 'user' ? 'You' : 'InsightIQ'} · ${timestamp(message.timestamp)}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph(message.content),
    ]),
  ]);
  const doc = new Document({ sections: [{ children: [new Paragraph({ text: 'InsightIQ conversation export', heading: HeadingLevel.TITLE }), ...children] }] });
  download(await Packer.toBlob(doc), `insightiq-chats-${stamp}.docx`);
}
