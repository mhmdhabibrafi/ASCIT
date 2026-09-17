"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

function renderMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  
  return lines.map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      return (
        <div key={i} className="flex gap-2 mt-1">
          <span className="font-medium min-w-[1rem]">{olMatch[1]}.</span>
          <span>{parseInline(olMatch[2])}</span>
        </div>
      );
    }
    
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      return (
        <div key={i} className="flex gap-2 mt-1">
          <span className="text-lg leading-none">&bull;</span>
          <span>{parseInline(ulMatch[1])}</span>
        </div>
      );
    }
    
    return <div key={i} className="mt-1">{parseInline(line)}</div>;
  });
}

function parseInline(text: string) {
  const elements: React.ReactNode[] = [];
  let current = "";
  let i = 0;
  
  while (i < text.length) {
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const char = text.substring(i, i + 2);
      const match = text.slice(i + 2).match(new RegExp(`^(.*?)\\${char.charAt(0)}{2}`));
      if (match) {
        if (current) elements.push(<span key={i + 't'}>{current}</span>);
        elements.push(<strong key={i}>{match[1]}</strong>);
        i += match[0].length + 4;
        current = "";
        continue;
      }
    }
    if ((text.startsWith('*', i) || text.startsWith('_', i)) && !text.startsWith('**', i) && !text.startsWith('__', i)) {
      const char = text[i];
      const match = text.slice(i + 1).match(new RegExp(`^(.*?)\\${char}`));
      if (match && !match[1].includes(char)) {
        if (current) elements.push(<span key={i + 't'}>{current}</span>);
        elements.push(<em key={i}>{match[1]}</em>);
        i += match[0].length + 2;
        current = "";
        continue;
      }
    }
    if (text.startsWith('`', i)) {
      const match = text.slice(i + 1).match(/^(.*?)`/);
      if (match) {
        if (current) elements.push(<span key={i + 't'}>{current}</span>);
        elements.push(<code key={i} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-[11px]">{match[1]}</code>);
        i += match[0].length + 2;
        current = "";
        continue;
      }
    }
    current += text[i];
    i++;
  }
  
  if (current) elements.push(<span key="end">{current}</span>);
  return elements.length > 0 ? elements : text;
}

export function FloatingChat() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ascit-chat-history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("ascit-chat-history", JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setShowScrollBottom(!isAtBottom);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setLoading(true);
    scrollToBottom();

    const assistantMsgIndex = nextMessages.length;
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, stream: true })
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "Gagal mendapatkan respons.");
      }

      if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let done = false;
          let currentContent = "";
          
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6);
                  if (dataStr === '[DONE]') break;
                  try {
                    const data = JSON.parse(dataStr);
                    if (data.token) {
                      currentContent += data.token;
                      setMessages(prev => {
                        const newMsgs = [...prev];
                        if (newMsgs[assistantMsgIndex]) {
                          newMsgs[assistantMsgIndex].content = currentContent;
                        }
                        return newMsgs;
                      });
                      scrollToBottom();
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      } else {
        const json = await response.json();
        setMessages(prev => {
          const newMsgs = [...prev];
          if (newMsgs[assistantMsgIndex]) {
            newMsgs[assistantMsgIndex].content = json.content || json.error || "Gagal mendapatkan respons.";
          }
          return newMsgs;
        });
      }
    } catch (err) {
      setMessages(prev => {
        const newMsgs = [...prev];
        if (newMsgs[assistantMsgIndex]) {
          newMsgs[assistantMsgIndex].content = err instanceof Error ? err.message : "Koneksi ke AI gagal.";
        }
        return newMsgs;
      });
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const resetChat = () => {
    setMessages([]);
    localStorage.removeItem("ascit-chat-history");
  };

  if (status !== "authenticated") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300",
          open
            ? "bg-slate-700 hover:bg-slate-800 rotate-0"
            : "bg-gradient-to-br from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700"
        )}
        title="ASCIT Assistant"
        aria-label="Buka chat assistant"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 origin-bottom-right",
          open
            ? "w-[380px] h-[520px] opacity-100 scale-100 pointer-events-auto"
            : "w-[380px] h-[520px] opacity-0 scale-90 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-700 to-emerald-900 px-4 py-3.5 text-white shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight">ASCIT Assistant</div>
            <div className="text-[11px] text-emerald-100/80 font-medium">AI Inventaris IT</div>
          </div>
          <button
            type="button"
            onClick={resetChat}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition"
            title="Reset percakapan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden bg-slate-50/50">
          <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">Halo! Saya ASCIT Assistant 👋</div>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-[260px]">
                    Tanyakan apa saja seputar inventaris &amp; manajemen aset IT.
                  </p>
                </div>
                <div className="grid gap-1.5 w-full max-w-[280px]">
                  {[
                    "Berapa total aset IT saat ini?",
                    "Aset mana yang perlu segera diganti?",
                    "Ringkasan kondisi aset per unit",
                    "Tips merawat laptop kantor"
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition"
                      onClick={() => {
                        setInput(q);
                        if (inputRef.current) {
                          inputRef.current.style.height = 'auto';
                        }
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                    >
                      &ldquo;{q}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm",
                    msg.role === "user"
                      ? "bg-emerald-700 text-white rounded-br-md whitespace-pre-wrap break-words"
                      : "bg-white border border-slate-200 text-slate-700 rounded-bl-md"
                  )}
                >
                  {msg.role === "user" ? msg.content : renderMarkdown(msg.content)}
                </div>
              </div>
            ))}

            {loading && messages.length > 0 && !messages[messages.length - 1].content && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
          
          {showScrollBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-slate-200 shadow-md rounded-full p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition"
              title="Ke paling bawah"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-3 py-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition min-h-[44px] max-h-[96px]"
              placeholder="Tanya soal aset IT..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim() || loading}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                input.trim() && !loading
                  ? "bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm"
                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
              )}
              title="Kirim"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="mt-1.5 text-center text-[10px] text-slate-400 font-medium">
            Powered by Ollama &middot; Khusus inventaris IT
          </div>
        </div>
      </div>
    </>
  );
}
