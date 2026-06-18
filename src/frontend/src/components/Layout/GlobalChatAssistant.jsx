import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatAssistant } from '../../context/ChatAssistantContext';
import { postAssistantChat } from '../../services/api';
import './GlobalChatAssistant.css';

function ChatBubbleIcon() {
  return (
    <svg
      className="global-chat-fab-svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WELCOME =
  'Hi — I am your PepsiCo Management System assistant. Ask about fleet health, production signals, root cause, recommendations, or planned work. I stay aligned with your session, including processing vs packaging line context. What would you like to know?';

/** Login, upload, and home redirect (no stable dashboard step) */
const CHAT_DISABLED_ROUTES = new Set(['/login', '/upload', '/']);

function normalizePath(p) {
  if (!p) return '/';
  const s = String(p).trim();
  if (!s) return '/';
  return s.replace(/\/+$/, '') || '/';
}

export default function GlobalChatAssistant() {
  const { routePath, pageTitle, mergedKnowledgeBase, uiContext } = useChatAssistant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(() => [{ role: 'assistant', content: WELCOME }]);
  const listRef = useRef(null);

  const pathNorm = normalizePath(routePath);
  const assistantEnabled = !CHAT_DISABLED_ROUTES.has(pathNorm);

  useEffect(() => {
    if (!assistantEnabled && open) setOpen(false);
  }, [assistantEnabled, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !assistantEnabled) return;

    const nextUser = { role: 'user', content: text };
    // Must not rely on setState updater running before await — React may defer it, which left messages [] for the API.
    const historyForApi = [...messages, nextUser].filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    setMessages((prev) => [...prev, nextUser]);
    setInput('');
    setLoading(true);

    try {
      const payload = {
        messages: historyForApi.map((m) => ({ role: m.role, content: m.content })),
        route: pathNorm,
        page_title: pageTitle || undefined,
        knowledge_base: mergedKnowledgeBase,
        ui_context: uiContext || undefined,
      };
      const data = await postAssistantChat(payload);
      const reply = (data && data.result) || 'No response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e?.message || String(e);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Something went wrong: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [assistantEnabled, input, loading, messages, mergedKnowledgeBase, pageTitle, pathNorm, uiContext]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!assistantEnabled) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="global-chat-fab"
        aria-label="Open assistant"
        title="Assistant"
        onClick={() => setOpen(true)}
      >
        <ChatBubbleIcon />
      </button>

      {open ? (
        <div className="global-chat-backdrop" role="presentation" onClick={() => setOpen(false)} />
      ) : null}

      <aside
        className={`global-chat-panel ${open ? 'global-chat-panel--open' : ''}`}
        aria-hidden={!open}
        aria-label="Chat assistant"
      >
        <header className="global-chat-header">
          <div>
            <div className="global-chat-title">Assistant</div>
            <div className="global-chat-sub">{routePath || '/'}</div>
          </div>
          <button type="button" className="global-chat-close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </header>

        <div className="global-chat-messages" ref={listRef}>
          {messages.map((m, i) => (
            <div key={i} className={`global-chat-bubble global-chat-bubble--${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading ? <div className="global-chat-bubble global-chat-bubble--assistant">Thinking…</div> : null}
        </div>

        <footer className="global-chat-footer">
          <textarea
            className="global-chat-input"
            rows={2}
            placeholder="Ask about this page or the demo…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button type="button" className="global-chat-send" onClick={send} disabled={loading || !input.trim()}>
            Send
          </button>
        </footer>
      </aside>
    </>,
    document.body
  );
}
