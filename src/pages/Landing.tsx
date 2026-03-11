import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import {
  ChevronLeft, ChevronRight, Star, Gift, MessageCircle,
  Copy, Check, X, ChevronDown, Sparkles, ArrowLeft
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Coupon {
  id: string; code: string; type: 'percent' | 'fixed';
  value: number; expiryDate: string; isActive: boolean;
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const WHATSAPP = '972525830758';
const SHOP_URL = '/shop';

const TESTIMONIALS = [
  { name: 'שרה כהן', role: 'מנהלת שיווק', text: 'המארזים של טוני שינו לגמרי את רמת המתנות החברתיות שלנו. כל לקוח שקיבל מארז פנה אלינו להזמין עוד!', stars: 5 },
  { name: 'דוד לוי', role: 'בעל עסק', text: 'שירות מדהים, אריזה יוקרתית ומיתוג מושלם. הגיע בדיוק כמו שהוזמן ובזמן. ממליץ בחום!', stars: 5 },
  { name: 'מיכל ישראל', role: 'אירועים ו-PR', text: 'כבר שנה שאני עובדת עם טוני לכל אירועי החברה. התוצאות תמיד מעל הציפיות.', stars: 5 },
  { name: 'אבי ברקוביץ', role: 'יזם', text: 'בדיוק מה שחיפשתי — מותג מקצועי, מוצרים איכותיים וחוויה שלמה מהזמנה עד קבלה.', stars: 5 },
];

const COLLECTIONS = [
  {
    title: 'מארזי חג',
    subtitle: 'לכל עונות השנה',
    desc: 'מארזים מרהיבים לראש השנה, חנוכה, פסח וכל חג — כולל מוצרים מובחרים ומיתוג אישי.',
    emoji: '🎄',
    accent: '#1E3A8A',
    image: 'https://picsum.photos/seed/holiday-gift-tony/600/400',
  },
  {
    title: 'מארזים לימי הולדת',
    subtitle: 'כי כל יום הולדת מיוחד',
    desc: 'הפתיעו אהובים עם מארז מותאם אישית שיגרום לכל יום הולדת לבלתי נשכח.',
    emoji: '🎂',
    accent: '#6D28D9',
    image: 'https://picsum.photos/seed/birthday-tony-gift/600/400',
  },
  {
    title: 'מארזים עסקיים',
    subtitle: 'מיתוג שמדבר בשבילך',
    desc: 'לחיזוק קשרים עסקיים, לעובדים ולשלוח מסר של הצלחה — כולל לוגו חברה.',
    emoji: '💼',
    accent: '#065F46',
    image: 'https://picsum.photos/seed/corporate-tony-gift/600/400',
  },
];

const GALLERY = [
  { src: 'https://picsum.photos/seed/tony-g1/600/800', tall: true },
  { src: 'https://picsum.photos/seed/tony-g2/600/500', tall: false },
  { src: 'https://picsum.photos/seed/tony-g3/600/500', tall: false },
  { src: 'https://picsum.photos/seed/tony-g4/600/800', tall: true },
  { src: 'https://picsum.photos/seed/tony-g5/600/500', tall: false },
  { src: 'https://picsum.photos/seed/tony-g6/600/500', tall: false },
];

const STEPS = [
  { num: '01', title: 'בחר מארז', desc: 'בחר מתוך קולקציית המארזים היוקרתיים שלנו' },
  { num: '02', title: 'הוסף מיתוג אישי', desc: 'לוגו, צבעים, כרטיס ברכה ומסר אישי' },
  { num: '03', title: 'קבל עד הבית', desc: 'משלוח מהיר ואריזה מושלמת בכל פעם' },
];

/* ─── Landing Page ───────────────────────────────────────────────────── */
export default function Landing() {
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [barVisible, setBarVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tIdx, setTIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  /* Fetch active coupon */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'coupons'), where('isActive', '==', true), limit(1)));
        if (!snap.empty) setCoupon({ id: snap.docs[0].id, ...snap.docs[0].data() } as Coupon);
      } catch { /* no coupons */ }
    })();
  }, []);

  /* Hero entrance */
  useEffect(() => { setTimeout(() => setHeroVisible(true), 100); }, []);

  /* Testimonial rotation */
  useEffect(() => {
    timerRef.current = setInterval(() => setTIdx(i => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  /* Scroll nav */
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const next = () => { clearInterval(timerRef.current); setTIdx(i => (i + 1) % TESTIMONIALS.length); };
  const prev = () => { clearInterval(timerRef.current); setTIdx(i => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length); };

  const copy = () => {
    if (!coupon) return;
    navigator.clipboard.writeText(coupon.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waLink = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('היי, אני מעוניין במארז מתנה מותג Tony')}`;

  return (
    <div
      dir="rtl"
      style={{ fontFamily: "'Inter', sans-serif", background: '#08080F', color: '#F0ECE0', overflowX: 'hidden' }}
    >
      <style>{`
        .serif { font-family: 'Playfair Display', Georgia, serif !important; }
        .gold-text { background: linear-gradient(135deg, #C9A84C 0%, #F0CC6E 50%, #C9A84C 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .gold-btn { background: linear-gradient(90deg, #C9A84C, #F0CC6E, #C9A84C); background-size: 200% auto; animation: shimmer 3s linear infinite; }
        @keyframes shimmer { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes pulse-gold { 0%,100% { box-shadow: 0 0 20px rgba(201,168,76,0.3); } 50% { box-shadow: 0 0 40px rgba(201,168,76,0.6); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.8s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.8s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.8s 0.25s ease both; }
        .fade-up-3 { animation: fadeUp 0.8s 0.4s ease both; }
        .fade-up-4 { animation: fadeUp 0.8s 0.55s ease both; }
        .card-lift { transition: transform 0.35s ease, box-shadow 0.35s ease; }
        .card-lift:hover { transform: translateY(-8px); box-shadow: 0 24px 60px rgba(201,168,76,0.18); }
        .gallery-zoom img { transition: transform 0.6s ease; }
        .gallery-zoom:hover img { transform: scale(1.07); }
        .wa-btn { animation: pulse-gold 2.5s ease-in-out infinite; }
        .dot-active { width: 24px !important; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0F0F1E; } ::-webkit-scrollbar-thumb { background: #C9A84C55; border-radius: 3px; }
      `}</style>

      {/* ── Coupon Bar ────────────────────────────────────────────────── */}
      {coupon && barVisible && (
        <div
          className="relative z-50 flex items-center justify-center gap-3 py-3 px-10 text-sm font-medium"
          style={{ background: 'linear-gradient(90deg,#8B6914,#C9A84C,#F0CC6E,#C9A84C,#8B6914)', backgroundSize: '200% auto', animation: 'shimmer 4s linear infinite', color: '#08080F' }}
        >
          <Sparkles size={14} />
          <span>
            {coupon.type === 'percent'
              ? `🎁 קבלו ${coupon.value}% הנחה על המארז הראשון עם הקוד:`
              : `🎁 קבלו ₪${coupon.value} הנחה עם הקוד:`}
            {' '}
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 font-black px-3 py-0.5 rounded-lg mx-1 transition-all hover:opacity-80 active:scale-95"
              style={{ background: 'rgba(8,8,15,0.2)', borderBottom: '1px solid rgba(8,8,15,0.3)' }}
            >
              {coupon.code}
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </span>
          <Sparkles size={14} />
          <button
            onClick={() => setBarVisible(false)}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-black/20 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-40 px-6 py-4 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(8,8,15,0.95)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(201,168,76,0.12)' : '1px solid transparent',
        }}
      >
        <div style={{ maxWidth: 1152, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#C9A84C,#F0CC6E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={18} color="#08080F" />
            </div>
            <span className="serif" style={{ fontSize: 22, fontWeight: 700, color: '#F0CC6E', letterSpacing: 1 }}>Tony</span>
          </a>

          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }} className="hidden md:flex">
            {[['#collections', 'קולקציות'], ['#how-it-works', 'איך זה עובד'], ['#gallery', 'גלריה'], ['#testimonials', 'ביקורות']].map(([href, label]) => (
              <a key={href} href={href} style={{ color: '#888', fontSize: 14, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0CC6E')}
                onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                {label}
              </a>
            ))}
          </div>

          <a href={SHOP_URL}
            className="gold-btn"
            style={{ padding: '10px 22px', borderRadius: 12, fontWeight: 700, fontSize: 14, color: '#08080F', textDecoration: 'none', transition: 'transform 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            לחנות ←
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '92vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* BG layers */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #1A1030 0%, #08080F 100%)' }} />
        <div style={{ position: 'absolute', top: '20%', right: '15%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)', animation: 'float 7s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '20%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,58,138,0.18) 0%, transparent 70%)', animation: 'float 9s ease-in-out 2s infinite' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'linear-gradient(rgba(201,168,76,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,1) 1px, transparent 1px)', backgroundSize: '70px 70px' }} />

        <div
          style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px', maxWidth: 860, margin: '0 auto', opacity: heroVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}
        >
          {/* Badge */}
          <div className="fade-up-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 18px', borderRadius: 999, border: '1px solid rgba(201,168,76,0.35)', background: 'rgba(201,168,76,0.08)', color: '#F0CC6E', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 28 }}>
            <Sparkles size={12} /> מותג יוקרה ישראלי מוביל
          </div>

          {/* Headline */}
          <h1 className="serif fade-up-2" style={{ fontSize: 'clamp(44px, 9vw, 88px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
            <span style={{ display: 'block', color: '#F0ECE0' }}>Tony</span>
            <span className="gold-text" style={{ display: 'block' }}>אמנות המיתוג</span>
            <span style={{ display: 'block', color: '#F0ECE0' }}>במארז אחד</span>
          </h1>

          <p className="fade-up-3" style={{ color: '#888', fontSize: 'clamp(16px, 2.5vw, 20px)', marginBottom: 44, maxWidth: 560, margin: '0 auto 44px', lineHeight: 1.7 }}>
            מארזי מתנה יוקרתיים עם מיתוג אישי. לאירועים, לעסקים ולכל רגע מיוחד.
          </p>

          {/* CTA Buttons */}
          <div className="fade-up-4" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 64 }}>
            <a href={SHOP_URL}
              className="gold-btn"
              style={{ padding: '16px 36px', borderRadius: 16, fontWeight: 700, fontSize: 18, color: '#08080F', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, transition: 'transform 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              <Gift size={20} /> קנה עכשיו
            </a>
            <a href="#how-it-works"
              style={{ padding: '16px 32px', borderRadius: 16, fontWeight: 600, fontSize: 15, color: '#aaa', textDecoration: 'none', border: '1px solid rgba(201,168,76,0.25)', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.55)'; e.currentTarget.style.color = '#F0ECE0'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.25)'; e.currentTarget.style.color = '#aaa'; }}>
              איך זה עובד <ChevronDown size={16} />
            </a>
          </div>

          {/* Stats */}
          <div className="fade-up-4" style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
            {[['500+', 'לקוחות מרוצים'], ['3 ימים', 'עד הבית'], ['100%', 'מיתוג אישי']].map(([val, label]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p className="serif gold-text" style={{ fontSize: 28, fontWeight: 700 }}>{val}</p>
                <p style={{ color: '#555', fontSize: 12, marginTop: 4 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#444', fontSize: 11 }}>
          <span>גלול למטה</span>
          <div style={{ width: 20, height: 34, border: '1px solid #333', borderRadius: 10, display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
            <div style={{ width: 3, height: 8, background: '#C9A84C', borderRadius: 2, animation: 'float 2s ease-in-out infinite' }} />
          </div>
        </div>
      </section>

      {/* ── Featured Collections ──────────────────────────────────────── */}
      <section id="collections" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 }}>הקולקציות שלנו</p>
            <h2 className="serif" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700 }}>מארזים לכל אירוע</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {COLLECTIONS.map(cat => (
              <a key={cat.title} href={SHOP_URL}
                className="card-lift"
                style={{ display: 'block', position: 'relative', overflow: 'hidden', borderRadius: 24, border: '1px solid #1E1E3A', textDecoration: 'none', background: '#0F0F1E', cursor: 'pointer' }}>
                <div style={{ aspectRatio: '4/3', overflow: 'hidden', position: 'relative' }}>
                  <img src={cat.image} alt={cat.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.65, transition: 'opacity 0.4s ease, transform 0.5s ease' }}
                    onMouseEnter={e => { (e.target as HTMLImageElement).style.opacity = '0.85'; (e.target as HTMLImageElement).style.transform = 'scale(1.05)'; }}
                    onMouseLeave={e => { (e.target as HTMLImageElement).style.opacity = '0.65'; (e.target as HTMLImageElement).style.transform = 'scale(1)'; }} />
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${cat.accent}CC 0%, transparent 60%)` }} />
                </div>
                <div style={{ padding: '20px 24px 24px' }}>
                  <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>{cat.emoji}</span>
                  <h3 className="serif" style={{ fontSize: 22, fontWeight: 700, color: '#F0ECE0', marginBottom: 4 }}>{cat.title}</h3>
                  <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>{cat.subtitle}</p>
                  <p style={{ color: '#666', fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>{cat.desc}</p>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#F0CC6E', fontSize: 13, fontWeight: 600 }}>
                    גלה עכשיו <ChevronLeft size={14} />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '96px 24px', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0D0D20, #08080F)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle, #C9A84C 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 }}>תהליך פשוט ומהיר</p>
            <h2 className="serif" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700 }}>איך זה עובד?</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, position: 'relative' }}>
            {/* Connector line (desktop) */}
            <div style={{ position: 'absolute', top: 36, right: '18%', left: '18%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.4), transparent)' }} className="hidden md:block" />

            {STEPS.map((step, i) => (
              <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative', zIndex: 1 }}>
                  <span className="serif" style={{ fontSize: 24, fontWeight: 700, color: '#F0CC6E' }}>{step.num}</span>
                </div>
                <h3 className="serif" style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{step.title}</h3>
                <p style={{ color: '#666', fontSize: 14, lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 56 }}>
            <a href={SHOP_URL}
              className="gold-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 14, fontWeight: 700, fontSize: 16, color: '#08080F', textDecoration: 'none', transition: 'transform 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              התחל עכשיו <ChevronLeft size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Gallery ──────────────────────────────────────────────────── */}
      <section id="gallery" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 }}>האיכות שלנו</p>
            <h2 className="serif" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700 }}>כל פרט מושלם</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '220px', gap: 12 }}>
            {GALLERY.map((img, i) => (
              <div key={i}
                className="gallery-zoom"
                style={{ overflow: 'hidden', borderRadius: 16, border: '1px solid #1E1E3A', gridRow: i === 0 || i === 3 ? 'span 2' : 'span 1', cursor: 'pointer' }}>
                <img src={img.src} alt={`gallery-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section id="testimonials" style={{ padding: '96px 24px', position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, #08080F, #0D0D20, #08080F)' }}>
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 }}>מה אומרים עלינו</p>
            <h2 className="serif" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700 }}>לקוחות מרוצים</h2>
          </div>

          {/* Slider */}
          <div style={{ position: 'relative' }}>
            {/* Decorative quote */}
            <div className="serif" style={{ position: 'absolute', top: -20, right: 20, fontSize: 120, lineHeight: 1, color: '#C9A84C', opacity: 0.08, pointerEvents: 'none', userSelect: 'none' }}>"</div>

            <div style={{ background: '#0F0F1E', border: '1px solid #1E1E3A', borderRadius: 28, padding: 'clamp(28px, 5vw, 48px)', minHeight: 200, boxShadow: '0 0 80px rgba(201,168,76,0.04)', position: 'relative', zIndex: 1 }}>
              <p className="serif" style={{ color: '#C8C0B0', fontSize: 'clamp(16px, 2.5vw, 20px)', lineHeight: 1.75, fontStyle: 'italic', marginBottom: 28 }}>
                "{TESTIMONIALS[tIdx].text}"
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#C9A84C,#F0CC6E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#08080F' }}>
                    {TESTIMONIALS[tIdx].name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: '#F0ECE0', fontSize: 15 }}>{TESTIMONIALS[tIdx].name}</p>
                    <p style={{ color: '#555', fontSize: 13 }}>{TESTIMONIALS[tIdx].role}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={15} fill="#C9A84C" color="#C9A84C" />)}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {TESTIMONIALS.map((_, i) => (
                  <button key={i} onClick={() => setTIdx(i)}
                    style={{ height: 8, borderRadius: 4, background: i === tIdx ? '#C9A84C' : '#2A2A4A', border: 'none', cursor: 'pointer', width: i === tIdx ? 28 : 8, transition: 'all 0.3s ease' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ fn: prev, Icon: ChevronRight }, { fn: next, Icon: ChevronLeft }].map(({ fn, Icon }, i) => (
                  <button key={i} onClick={fn}
                    style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid #2A2A4A', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', transition: 'all 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = '#F0ECE0'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2A4A'; (e.currentTarget as HTMLButtonElement).style.color = '#666'; }}>
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 32, padding: 'clamp(40px, 8vw, 80px) clamp(28px, 6vw, 72px)', border: '1px solid rgba(201,168,76,0.2)', background: 'linear-gradient(135deg, #0D1028, #180D30, #0D1028)', textAlign: 'center' }}>
            {/* Gold glow bg */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,168,76,0.08), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 16 }}>מוכן להתחיל?</p>
              <h2 className="serif" style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 20 }}>
                הזמן את המארז<br />שלך היום
              </h2>
              <p style={{ color: '#666', marginBottom: 44, maxWidth: 480, margin: '0 auto 44px', lineHeight: 1.7, fontSize: 16 }}>
                צור קשר עכשיו ונבנה יחד את מארז המתנה המושלם עם המיתוג שלך
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                <a href={SHOP_URL}
                  className="gold-btn"
                  style={{ padding: '16px 40px', borderRadius: 14, fontWeight: 700, fontSize: 17, color: '#08080F', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                  לחנות המלאה <ArrowLeft size={18} />
                </a>
                <a href={waLink} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '16px 36px', borderRadius: 14, fontWeight: 600, fontSize: 15, color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(74,222,128,0.08)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(74,222,128,0.55)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(74,222,128,0.3)'; }}>
                  <MessageCircle size={18} /> ווצאפ מהיר
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #1E1E3A', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#C9A84C,#F0CC6E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={16} color="#08080F" />
            </div>
            <div>
              <p className="serif" style={{ fontSize: 18, fontWeight: 700, color: '#F0CC6E', margin: 0 }}>Tony</p>
              <p style={{ color: '#444', fontSize: 11, margin: 0 }}>מארזי מתנה יוקרתיים</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {[[SHOP_URL, 'חנות'], ['#collections', 'קולקציות'], ['#gallery', 'גלריה'], [waLink, 'צור קשר']].map(([href, label]) => (
              <a key={label} href={href} target={href.startsWith('https') ? '_blank' : undefined} rel={href.startsWith('https') ? 'noopener noreferrer' : undefined}
                style={{ color: '#444', fontSize: 13, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0CC6E')}
                onMouseLeave={e => (e.currentTarget.style.color = '#444')}>
                {label}
              </a>
            ))}
          </div>
          <p style={{ color: '#333', fontSize: 12 }}>© {new Date().getFullYear()} Tony. כל הזכויות שמורות.</p>
        </div>
      </footer>

      {/* ── Floating WhatsApp ─────────────────────────────────────────── */}
      <a href={waLink} target="_blank" rel="noopener noreferrer"
        className="wa-btn"
        style={{ position: 'fixed', bottom: 28, left: 28, zIndex: 50, width: 58, height: 58, borderRadius: '50%', background: 'linear-gradient(135deg, #25D366, #128C7E)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', transition: 'transform 0.25s ease' }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        <MessageCircle size={26} color="white" fill="white" />
        <div style={{ position: 'absolute', left: '110%', marginLeft: 8, background: '#0F0F1E', border: '1px solid #2A2A4A', color: '#F0ECE0', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}
          className="wa-tooltip">
          שאל אותנו בווצאפ
        </div>
      </a>

      <style>{`.wa-btn:hover .wa-tooltip { opacity: 1 !important; }`}</style>
    </div>
  );
}
