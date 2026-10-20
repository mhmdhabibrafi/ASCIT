import { Fragment } from "react";

// Render a limited Markdown subset as React nodes. Release content never becomes HTML.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-slate-700">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={index} className="rounded bg-slate-100 px-1">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return /^https?:\/\//i.test(link[2]) ? <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{link[1]}</a> : <Fragment key={index}>{link[1]}</Fragment>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function ReleaseNotes({ notes }: { notes: string }) {
  const lines = notes.slice(0, 12000).replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, "").split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^[-*_]{3,}$/.test(line)) { blocks.push(<hr key={i} className="border-slate-100" />); continue; }
    if (/^#{1,6}\s/.test(line)) { blocks.push(<h4 key={i} className="font-semibold text-slate-800">{inline(line.replace(/^#{1,6}\s+/, ""))}</h4>); continue; }
    if (/^([-*+]\s|\d+\.\s)/.test(line)) {
      const start = i;
      const ordered = /^\d+\./.test(line);
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
      const items = [];
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(pattern, ""))}</li>); i++;
      }
      i--;
      blocks.push(ordered ? <ol key={start} className="list-decimal space-y-2 pl-5">{items}</ol> : <ul key={start} className="list-disc space-y-2 pl-5 marker:text-slate-400">{items}</ul>);
    } else blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="space-y-4 break-words text-sm leading-7 text-slate-600">{blocks}</div>;
}
