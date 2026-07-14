import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

interface RecommendedProduct {
  id: string;
  name: string;
  price: number;
  main_image: string | null;
}

interface AssistantResponse {
  answer: string;
  products: RecommendedProduct[];
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  products?: RecommendedProduct[];
}

interface GiftAssistantProps {
  onNavigateToProduct?: (productId: string) => void;
}

const functions = getFunctions(app);
const askGiftAssistant = httpsCallable<{ query: string }, AssistantResponse>(
  functions,
  'askGiftAssistant'
);

export default function GiftAssistant({ onNavigateToProduct }: GiftAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'שלום! אני עוזר המתנות של טוני ✨\nספר לי למה אתה מחפש מתנה ואמצא לך את המושלמת.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    if (q.length < 3) {
      setInputError('אנא הכנס לפחות 3 תווים');
      return;
    }
    setInputError('');
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const result = await askGiftAssistant({ query: q });
      const { answer, products } = result.data;
      setMessages(prev => [...prev, { role: 'assistant', text: answer, products }]);
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const errMsg = code === 'functions/resource-exhausted'
        ? 'שלחת יותר מדי בקשות. נסה שוב בעוד דקה. ⏳'
        : 'מצטער, אירעה שגיאה. נסה שוב.';
      setMessages(prev => [...prev, { role: 'assistant', text: errMsg }]);
    } finally {
      setLoading(false);
    }
  }

  function handleProductClick(id: string) {
    if (onNavigateToProduct) {
      onNavigateToProduct(id);
      setOpen(false);
    } else {
      window.location.href = `/product/${id}`;
    }
  }

  return (
    <>
      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={() => setOpen(true)}
            aria-label="פתח עוזר מתנות"
            style={{
              position: 'fixed',
              bottom: 28,
              right: 28,
              zIndex: 200,
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: '#1A1A18',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(255,154,158,0.55)',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.12)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
          >
            <Sparkles size={26} color="white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat window ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{
              position: 'fixed',
              bottom: 28,
              right: 28,
              zIndex: 300,
              width: 'min(380px, calc(100vw - 32px))',
              height: 'min(560px, calc(100dvh - 120px))',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #E7D7C9',
            }}
          >
            {/* Header */}
            <div style={{
              background: '#1A1A18',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={18} color="white" />
                </div>
                <div>
                  <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 15 }}>עוזר המתנות של טוני</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="white" />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-start' : 'flex-end' }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                    background: msg.role === 'user' ? 'white' : '#EDE9E3',
                    border: msg.role === 'user' ? '1px solid #f0e6ea' : '1px solid #E7D7C9',
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: '#1A1A18',
                    whiteSpace: 'pre-wrap',
                    direction: 'rtl',
                    textAlign: 'right',
                  }}>
                    {msg.text}
                  </div>

                  {/* Product cards */}
                  {msg.products && msg.products.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto', paddingBottom: 4, maxWidth: '100%' }}>
                      {msg.products.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleProductClick(p.id)}
                          style={{
                            flexShrink: 0,
                            width: 110,
                            background: 'white',
                            border: '1px solid #E7D7C9',
                            borderRadius: 14,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            textAlign: 'right',
                            padding: 0,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            boxShadow: '0 2px 8px rgba(255,154,158,0.1)',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(255,154,158,0.25)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(255,154,158,0.1)';
                          }}
                        >
                          <div style={{ width: '100%', height: 80, background: '#EDE9E3', overflow: 'hidden' }}>
                            {p.main_image
                              ? <img src={p.main_image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎁</div>
                            }
                          </div>
                          <div style={{ padding: '6px 8px' }}>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#1A1A18', lineHeight: 1.3, direction: 'rtl' }}>{p.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#1A1A18', fontWeight: 700 }}>₪{p.price}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking indicator */}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    padding: '10px 16px',
                    background: '#EDE9E3',
                    border: '1px solid #E7D7C9',
                    borderRadius: '18px 18px 4px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#b07080',
                    fontSize: 13,
                  }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    חושב...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '8px 14px 12px',
              borderTop: '1px solid #E2E2E2',
              background: 'white',
              flexShrink: 0,
            }}>
              {/* Validation error + char counter */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#e57373', fontSize: 11, direction: 'rtl' }}>
                  {inputError}
                </span>
                <span style={{ color: input.length >= 230 ? '#e57373' : '#c0a0b0', fontSize: 11 }}>
                  {input.length}/250
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); if (inputError) setInputError(''); }}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="לדוגמה: מתנה לאמא בת 50..."
                maxLength={250}
                disabled={loading}
                style={{
                  flex: 1,
                  border: '1.5px solid #E2E2E2',
                  borderRadius: 999,
                  padding: '10px 16px',
                  fontSize: 13,
                  outline: 'none',
                  background: '#fff5f7',
                  color: '#1A1A18',
                  direction: 'rtl',
                }}
                onFocus={e => (e.target.style.borderColor = '#1A1A18')}
                onBlur={e => (e.target.style.borderColor = '#E2E2E2')}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: loading || !input.trim() ? '#E2E2E2' : '#1A1A18',
                  border: 'none',
                  cursor: loading || !input.trim() ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                <Send size={16} color={loading || !input.trim() ? '#d4a0b0' : 'white'} style={{ transform: 'scaleX(-1)' }} />
              </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
