import React, { useEffect, useState } from 'react';
import AccessibilityWidget from '../components/AccessibilityWidget';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface LegalPageProps {
  docKey: 'terms' | 'privacy' | 'shipping';
  title: string;
  defaultContent: string;
}

export default function LegalPage({ docKey, title, defaultContent }: LegalPageProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'siteSettings', docKey))
      .then(snap => {
        if (snap.exists() && snap.data().content) {
          setContent(snap.data().content);
        } else {
          setContent(defaultContent);
        }
      })
      .catch(() => setContent(defaultContent))
      .finally(() => setLoading(false));
  }, [docKey, defaultContent]);

  return (
    <div dir="rtl" style={{ fontFamily: 'Arial, Helvetica, sans-serif', background: '#fafafa', minHeight: '100vh', color: '#111' }}>
      <AccessibilityWidget />

      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" aria-label="חזרה לדף הבית"
          style={{ color: '#1A1A18', textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← חזרה לדף הבית
        </a>
        <span style={{ color: '#ddd' }}>|</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#111' }}>Tony — אמנות המיתוג</span>
      </header>

      <main id="main-content" style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, color: '#111' }}>{title}</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40, borderBottom: '1px solid #ececec', paddingBottom: 20 }}>
          עדכון אחרון: {new Date().toLocaleDateString('he-IL')}
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>טוען...</div>
        ) : (
          <div style={{ color: '#333', lineHeight: 2, fontSize: 15, whiteSpace: 'pre-wrap' }}>
            {content}
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #ececec', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span style={{ color: '#999', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>מידע משפטי:</span>
          {[
            ['/accessibility', '♿ הצהרת נגישות'],
            ['/terms', 'תקנון האתר'],
            ['/privacy', 'מדיניות פרטיות'],
            ['/shipping', 'משלוחים והחזרות'],
          ].map(([href, label]) => (
            <a key={href} href={href}
              style={{ color: '#1A1A18', fontSize: 13, textDecoration: 'none', padding: '3px 10px', borderRadius: 999, border: '1px solid #ffe0e8', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fff5f7')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {label}
            </a>
          ))}
        </div>
        <a href="/" style={{ color: '#aaa', textDecoration: 'none', fontSize: 13, display: 'inline-block', marginBottom: 8 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#1A1A18')}
          onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}>
          ← חזרה לדף הבית
        </a>
        <p style={{ color: '#bbb', fontSize: 12, marginTop: 6 }}>© {new Date().getFullYear()} Tony — אמנות המיתוג. כל הזכויות שמורות.</p>
      </footer>
    </div>
  );
}
