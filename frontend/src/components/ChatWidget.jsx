// Floating Gemini-powered help bot.
//
// Collapsed: a circular brand-mark button anchored to the bottom-right.
// Expanded: a chat panel with message history and an input row.

import { useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { LogoMark } from './Logo';
import { chat as chatApi } from '../api/client';

const GREETING = {
  role: 'assistant',
  content:
    "Hi! I'm the CareConnect Assistant. Ask me how to book a visit, message a caregiver, or anything else about the app.",
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function handleSend(e) {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const res = await chatApi.send(
        next.filter((m) => m.role === 'user' || m.role === 'assistant')
      );
      const reply = res?.data?.reply || "Sorry, I didn't catch that.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Collapsed launcher — circular logo button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open CareConnect assistant"
          className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-600)] text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-[var(--color-primary-700)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-200)]"
        >
          <LogoMark size={28} className="text-white" />
          <span className="sr-only">Chat with the CareConnect assistant</span>
        </button>
      )}

      {/* Expanded panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="CareConnect assistant"
          className="fixed bottom-6 right-6 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-2xl"
          style={{ height: 'min(560px, calc(100vh - 3rem))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-primary-600)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <LogoMark size={22} className="text-white" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">CareConnect Assistant</div>
                <div className="text-xs opacity-80">Powered by Gemini</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-neutral-50)] px-3 py-3"
          >
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <MessageBubble role="assistant" content="…" muted />
            )}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 border-t border-[var(--color-border)] bg-white px-3 py-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={1}
              placeholder="Ask a question…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-500)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-100)]"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-600)] text-white transition hover:bg-[var(--color-primary-700)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({ role, content, muted = false }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-snug ${
          isUser
            ? 'bg-[var(--color-primary-600)] text-white'
            : 'bg-white text-[var(--color-neutral-900)] border border-[var(--color-border)]'
        } ${muted ? 'opacity-60' : ''}`}
      >
        {content}
      </div>
    </div>
  );
}
