import React from 'react';
import AccessibilityWidget from '../components/AccessibilityWidget';

export default function AccessibilityPage() {
  return (
    <div dir="rtl" style={{ fontFamily: 'Arial, Helvetica, sans-serif', background: '#fafafa', minHeight: '100vh', color: '#111' }}>
      <AccessibilityWidget />

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" aria-label="חזרה לדף הבית"
          style={{ color: '#ff9a9e', textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← חזרה לדף הבית
        </a>
        <span style={{ color: '#ddd' }}>|</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#111' }}>Tony — אמנות המיתוג</span>
      </header>

      <main id="main-content" style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, color: '#111' }}>הצהרת נגישות</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40, borderBottom: '1px solid #ececec', paddingBottom: 20 }}>
          עדכון אחרון: {new Date().toLocaleDateString('he-IL')}
        </p>

        <Section title="מחויבות לנגישות">
          <p>אתר Tony — אמנות המיתוג מחויב לנגישות דיגיטלית עבור כלל המשתמשים, לרבות אנשים עם מוגבלויות. אנו שואפים לספק חוויית גלישה שוויונית ולעמוד בדרישות החוק.</p>
          <p style={{ marginTop: 12 }}>האתר פועל בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע"ג-2013, ושואף לעמוד ברמת AA של תקן WCAG 2.1.</p>
        </Section>

        <Section title="אמצעי הנגישות המובנים באתר">
          <ul style={{ paddingRight: 20, lineHeight: 2 }}>
            {[
              'תפריט נגישות צף הכולל הגדרות ויזואליות, טקסט וניווט',
              'ניגודיות גבוהה, ניגוד הפוך, גוני אפור ורוויה גבוהה',
              'הגדלה והקטנה של גופן, ריווח מילים ואותיות',
              'גופן קריא (Arial) לשיפור קריאות',
              'סמן מוגדל בגרסה כהה ובהירה',
              'הדגשת קישורים וכותרות לאיתור מהיר',
              'עצירת אנימציות למשתמשים רגישים לתנועה',
              'ניווט מקלדת מלא עם Tab indexing ו-Focus ring',
              'קישור "דלג לתוכן" בראש כל עמוד',
              'תגיות ARIA לתאימות עם קוראי מסך',
              'תגיות alt לכל תמונות המוצרים',
              'כיוון RTL מלא לשפה העברית',
            ].map(item => <li key={item}>✓ {item}</li>)}
          </ul>
        </Section>

        <Section title="היבטים שאינם נגישים במלואם">
          <p>חרף מאמצינו, ייתכן שחלק מהתכנים אינם עומדים בדרישות הנגישות המלאות:</p>
          <ul style={{ paddingRight: 20, lineHeight: 2, marginTop: 8 }}>
            <li>תמונות ישנות שהועלו לפני יישום מדיניות ה-alt text עשויות להיות חסרות תיאור</li>
            <li>תכני PDF חיצוניים אינם תחת שליטתנו הישירה</li>
          </ul>
          <p style={{ marginTop: 12 }}>אנו עובדים לשפר זאת באופן שוטף.</p>
        </Section>

        <Section title="תאימות דפדפנים">
          <p>האתר נבדק ותואם לדפדפנים הבאים בשילוב עם טכנולוגיות מסייעות:</p>
          <ul style={{ paddingRight: 20, lineHeight: 2, marginTop: 8 }}>
            <li>Chrome + NVDA (Windows)</li>
            <li>Safari + VoiceOver (macOS / iOS)</li>
            <li>Firefox + JAWS (Windows)</li>
          </ul>
        </Section>

        <Section title="פנייה בנושא נגישות">
          <p>נתקלת בבעיית נגישות, קושי בגישה לתוכן, או יש לך הצעה לשיפור? נשמח לשמוע ולסייע בהקדם האפשרי:</p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ContactItem icon="📞" label="טלפון" value="052-583-0758" href="tel:+972525830758" />
            <ContactItem icon="💬" label="WhatsApp" value="שיחה ישירה" href="https://wa.me/972525830758" />
          </div>
          <p style={{ marginTop: 16, color: '#888', fontSize: 13 }}>
            נשתדל להגיב תוך 2 ימי עסקים.
          </p>
        </Section>

        <div style={{ marginTop: 40, padding: '20px 24px', background: 'linear-gradient(135deg,#fff5f5,#f0f7ff)', borderRadius: 16, border: '1px solid #ffe0e0' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>גרסת הצהרה זו</p>
          <p style={{ fontSize: 13, color: '#666' }}>
            הצהרת נגישות זו עודכנה לאחרונה ב-{new Date().toLocaleDateString('he-IL')}
            {' '}ומתייחסת לאתר הפועל בכתובת tony-amramy-branding.web.app.
          </p>
        </div>
      </main>

      <footer style={{ borderTop: '1px solid #ececec', padding: '24px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
        © {new Date().getFullYear()} Tony — אמנות המיתוג. כל הזכויות שמורות.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }} aria-label={title}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#ff9a9e', marginBottom: 14,
                   paddingBottom: 10, borderBottom: '2px solid #ffe0e8' }}>
        {title}
      </h2>
      <div style={{ color: '#333', lineHeight: 1.8, fontSize: 15 }}>{children}</div>
    </section>
  );
}

function ContactItem({ icon, label, value, href }: { icon: string; label: string; value: string; href: string }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
               background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
               textDecoration: 'none', color: '#111', transition: 'box-shadow 0.2s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,154,158,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span>
        <span style={{ fontSize: 12, color: '#888', display: 'block' }}>{label}</span>
        <span style={{ fontWeight: 700, color: '#ff9a9e' }}>{value}</span>
      </span>
    </a>
  );
}
