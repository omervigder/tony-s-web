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
          style={{ color: '#ff9a9e', textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
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

      <footer style={{ borderTop: '1px solid #ececec', padding: '24px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['/', 'דף הבית'], ['/accessibility', 'נגישות'], ['/terms', 'תקנון'], ['/privacy', 'פרטיות'], ['/shipping', 'משלוחים']].map(([href, label]) => (
            <a key={href} href={href} style={{ color: '#aaa', textDecoration: 'none', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ff9a9e')}
              onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}>
              {label}
            </a>
          ))}
        </div>
        © {new Date().getFullYear()} Tony — אמנות המיתוג. כל הזכויות שמורות.
      </footer>
    </div>
  );
}
