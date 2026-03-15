import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ─── State ───────────────────────────────────────────────────────────────── */
interface A11yState {
  highContrast: boolean;
  negativeContrast: boolean;
  grayscale: boolean;
  blackWhite: boolean;
  highlightLinks: boolean;
  screenReader: boolean;
  fontSize: number;       // steps ×2px
  wordSpacing: number;    // steps ×3px
  letterSpacing: number;  // steps ×1px
  highlightTitles: boolean;
  bigCursor: 'none' | 'dark' | 'light';
  ttsRate: number;        // 0.5–2
}

const DEFAULT: A11yState = {
  highContrast: false, negativeContrast: false, grayscale: false, blackWhite: false,
  highlightLinks: false, screenReader: false,
  fontSize: 0, wordSpacing: 0, letterSpacing: 0,
  highlightTitles: false, bigCursor: 'none', ttsRate: 1,
};

const LS_KEY   = 'tony-a11y-v3';
const STYLE_ID = 'tony-a11y-css';

const CURSOR_DARK  = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M8 4 L8 36 L17 27 L22 38 L28 35 L23 24 L35 24 Z' fill='%23111' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E") 8 4, auto`;
const CURSOR_LIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M8 4 L8 36 L17 27 L22 38 L28 35 L23 24 L35 24 Z' fill='%23fff' stroke='%23111' stroke-width='2'/%3E%3C/svg%3E") 8 4, auto`;

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
function injectCSS() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    body.a11y-high-contrast       { filter: contrast(2.2) brightness(1.05) !important; }
    body.a11y-negative-contrast   { filter: invert(1) hue-rotate(180deg) !important; }
    body.a11y-grayscale           { filter: grayscale(1) !important; }
    body.a11y-black-white         { filter: grayscale(1) contrast(100) !important; }
    body.a11y-highlight-links a   { background:#ffff00!important;color:#000!important;
                                    outline:2px solid #000!important;border-radius:3px!important;padding:0 2px!important; }
    body.a11y-highlight-titles h1,
    body.a11y-highlight-titles h2,
    body.a11y-highlight-titles h3,
    body.a11y-highlight-titles h4,
    body.a11y-highlight-titles h5,
    body.a11y-highlight-titles h6  { background:#fffde7!important;outline:2px solid #f59e0b!important;
                                     border-radius:4px!important;padding:2px 6px!important;color:#000!important; }
    body.a11y-cursor-dark,
    body.a11y-cursor-dark *        { cursor:${CURSOR_DARK}!important; }
    body.a11y-cursor-light,
    body.a11y-cursor-light *       { cursor:${CURSOR_LIGHT}!important; }
    body.a11y-tts-on *:hover       { outline:2px solid #3b82f6!important;
                                     background:rgba(59,130,246,0.07)!important; }
    *:focus-visible                { outline:3px solid #3b82f6!important;outline-offset:3px!important; }
    .a11y-skip                     { position:absolute;top:-60px;right:16px;z-index:999999;
                                     background:#1d4ed8;color:#fff;padding:10px 20px;
                                     border-radius:0 0 10px 10px;font-weight:700;
                                     font-size:15px;transition:top .2s;text-decoration:none; }
    .a11y-skip:focus               { top:0; }
    .a11y-panel-in                 { animation:a11yIn .22s ease; }
    @keyframes a11yIn              { from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1} }
  `;
  document.head.appendChild(s);
}

function loadState(): A11yState {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}

function applyState(s: A11yState) {
  const b = document.body;
  const r = document.documentElement;
  b.classList.toggle('a11y-high-contrast',     s.highContrast);
  b.classList.toggle('a11y-negative-contrast', s.negativeContrast);
  b.classList.toggle('a11y-grayscale',         s.grayscale);
  b.classList.toggle('a11y-black-white',       s.blackWhite);
  b.classList.toggle('a11y-highlight-links',   s.highlightLinks);
  b.classList.toggle('a11y-highlight-titles',  s.highlightTitles);
  b.classList.toggle('a11y-cursor-dark',       s.bigCursor === 'dark');
  b.classList.toggle('a11y-cursor-light',      s.bigCursor === 'light');
  b.classList.toggle('a11y-tts-on',            s.screenReader);
  r.style.fontSize     = s.fontSize     ? `${16 + s.fontSize * 2}px` : '';
  r.style.wordSpacing  = s.wordSpacing  ? `${s.wordSpacing * 3}px`   : '';
  r.style.letterSpacing= s.letterSpacing? `${s.letterSpacing}px`     : '';
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const VISUAL_KEYS = ['highContrast','negativeContrast','grayscale','blackWhite'] as const;

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function Tile({ icon, label, active, onClick, tabIndex }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; tabIndex?: number;
}) {
  return (
    <button
      onClick={onClick}
      tabIndex={tabIndex ?? 0}
      aria-pressed={active}
      aria-label={label}
      style={{
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        gap:6,padding:'10px 4px',borderRadius:10,
        border:`2px solid ${active?'#1d4ed8':'#dde3ed'}`,
        background:active?'#eff6ff':'#f9fafb',
        color:active?'#1d4ed8':'#374151',
        cursor:'pointer',fontSize:12,fontWeight:700,
        width:'100%',minHeight:72,textAlign:'center',
        transition:'all .15s',lineHeight:1.3,
      }}
      onMouseEnter={e=>{if(!active)e.currentTarget.style.borderColor='#93c5fd';}}
      onMouseLeave={e=>{if(!active)e.currentTarget.style.borderColor='#dde3ed';}}
    >
      <span style={{fontSize:24,lineHeight:1}}>{icon}</span>
      <span style={{fontSize:12,maxWidth:72,whiteSpace:'pre-wrap',textAlign:'center'}}>{label}</span>
    </button>
  );
}

function Stepper({ label, value, unit, defaultVal, onSet, min, max }: {
  label: string; value: number; unit: string; defaultVal: number;
  onSet: (n:number)=>void; min: number; max: number;
}) {
  const displayVal = `${value === 0 ? (label.includes('גופן') ? '100%' : '0') : (value > 0 ? '+' : '') + value}${value !== 0 ? unit : ''}`;
  const btnStyle: React.CSSProperties = {
    width:34,height:34,borderRadius:8,border:'1.5px solid #dde3ed',
    background:'#f9fafb',cursor:'pointer',fontWeight:700,fontSize:18,
    display:'flex',alignItems:'center',justifyContent:'center',color:'#374151',
    flexShrink:0, transition:'background .1s',
  };
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{fontSize:14,fontWeight:700,color:'#1f2937'}}>{label}</span>
        <button
          onClick={() => onSet(defaultVal)}
          style={{fontSize:12,color:'#6b7280',background:'none',border:'1px solid #e5e7eb',
                  borderRadius:6,padding:'2px 8px',cursor:'pointer'}}
        >
          איפוס {label.includes('גופן') ? '100%' : '0'}
        </button>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={()=>onSet(Math.max(min,value-1))} disabled={value<=min}
          style={{...btnStyle,opacity:value<=min?.4:1}} aria-label={`הקטן ${label}`}>−</button>
        <div style={{flex:1,textAlign:'center',background:'#f1f5f9',borderRadius:8,
                     padding:'8px 0',fontWeight:700,fontSize:15,color:'#1f2937'}}>
          {displayVal}
        </div>
        <button onClick={()=>onSet(Math.min(max,value+1))} disabled={value>=max}
          style={{...btnStyle,opacity:value>=max?.4:1}} aria-label={`הגדל ${label}`}>+</button>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,margin:'14px 0 10px'}}>
      <div style={{flex:1,height:1,background:'#e5e7eb'}}/>
      <span style={{fontSize:12,fontWeight:800,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap'}}>
        {label}
      </span>
      <div style={{flex:1,height:1,background:'#e5e7eb'}}/>
    </div>
  );
}

/* ─── Accessibility Statement Modal ─────────────────────────────── */
function StatementModal({ onClose }: { onClose:()=>void }) {
  useEffect(()=>{
    document.body.style.overflow='hidden';
    const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',esc);
    return ()=>{document.body.style.overflow='';document.removeEventListener('keydown',esc);};
  },[onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="stmt-title"
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,.6)',
              display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div dir="rtl" style={{background:'#fff',borderRadius:18,padding:'32px 28px',
                              maxWidth:640,width:'100%',maxHeight:'88vh',overflowY:'auto',
                              fontFamily:'Arial,sans-serif',lineHeight:1.75,position:'relative'}}>
        <button onClick={onClose} aria-label="סגור"
          style={{position:'absolute',top:14,left:14,background:'none',border:'none',
                  cursor:'pointer',fontSize:22,color:'#9ca3af'}}>✕</button>
        <h1 id="stmt-title" style={{fontSize:22,fontWeight:900,marginBottom:6}}>הצהרת נגישות</h1>
        <p style={{color:'#9ca3af',fontSize:13,marginBottom:24}}>עדכון: {new Date().toLocaleDateString('he-IL')}</p>
        {[
          ['מחויבות','Tony מחויבת לנגישות דיגיטלית לפי תקנות שוויון זכויות לאנשים עם מוגבלות (תשע"ג-2013) ורמת AA של WCAG 2.1.'],
          ['פנייה','נתקלת בבעיית נגישות? צור קשר: 052-583-0758 או דרך WhatsApp.'],
        ].map(([t,b])=>(
          <div key={t} style={{marginBottom:20}}>
            <h2 style={{fontSize:15,fontWeight:700,color:'#1d4ed8',marginBottom:6}}>{t}</h2>
            <p style={{color:'#374151',margin:0}}>{b}</p>
          </div>
        ))}
        <a href="/accessibility" style={{display:'inline-block',marginTop:8,color:'#1d4ed8',fontWeight:700}}>
          לקריאת ההצהרה המלאה ←
        </a>
      </div>
    </div>
  );
}

/* ─── Cookie Banner ──────────────────────────────────────────────── */
function CookieBanner({ onStatement }:{onStatement:()=>void}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{if(!localStorage.getItem('tony-cookies'))setVisible(true);},[]);
  if(!visible) return null;
  return (
    <div role="region" aria-label="הסכמה לעוגיות" dir="rtl"
      style={{position:'fixed',bottom:0,left:0,right:0,zIndex:88888,
              background:'rgba(15,15,30,.97)',color:'#f0ece0',
              borderTop:'1px solid rgba(255,255,255,.1)',
              padding:'12px 24px',display:'flex',alignItems:'center',
              justifyContent:'center',gap:14,flexWrap:'wrap',fontSize:13}}>
      <span>
        אתר זה משתמש בעוגיות לשיפור חוויית הגלישה.{' '}
        <button onClick={onStatement}
          style={{background:'none',border:'none',color:'#93c5fd',textDecoration:'underline',cursor:'pointer',fontSize:13,padding:0}}>
          מדיניות נגישות
        </button>
      </span>
      <button onClick={()=>{localStorage.setItem('tony-cookies','1');setVisible(false);}}
        style={{background:'linear-gradient(90deg,#C9A84C,#F0CC6E)',color:'#08080F',
                border:'none',borderRadius:8,padding:'7px 20px',fontWeight:700,cursor:'pointer',
                fontSize:13,whiteSpace:'nowrap'}}>
        אישור
      </button>
    </div>
  );
}

/* ─── Main Widget ─────────────────────────────────────────────────── */
export default function AccessibilityWidget() {
  const [open,setOpen]=useState(false);
  const [settings,setSettings]=useState<A11yState>({...DEFAULT});
  const [showStmt,setShowStmt]=useState(false);
  const ttsTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const panelRef=useRef<HTMLDivElement>(null);

  /* init */
  useEffect(()=>{
    injectCSS();
    const s=loadState();
    setSettings(s);
    applyState(s);
  },[]);

  /* TTS hover */
  useEffect(()=>{
    if(!settings.screenReader){window.speechSynthesis?.cancel();return;}
    const handle=(e:MouseEvent)=>{
      const el=e.target as HTMLElement;
      const text=el?.innerText?.trim();
      if(!text||text.length<4) return;
      if(ttsTimerRef.current) clearTimeout(ttsTimerRef.current);
      ttsTimerRef.current=setTimeout(()=>{
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(text);
        u.lang='he-IL'; u.rate=settings.ttsRate;
        window.speechSynthesis.speak(u);
      },350);
    };
    document.addEventListener('mouseover',handle);
    return ()=>{document.removeEventListener('mouseover',handle);if(ttsTimerRef.current)clearTimeout(ttsTimerRef.current);};
  },[settings.screenReader,settings.ttsRate]);

  /* close on Escape */
  useEffect(()=>{
    if(!open) return;
    const h=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('keydown',h);
    return ()=>document.removeEventListener('keydown',h);
  },[open]);

  const update=useCallback((patch:Partial<A11yState>)=>{
    setSettings(prev=>{
      const next={...prev,...patch};
      localStorage.setItem(LS_KEY,JSON.stringify(next));
      applyState(next);
      return next;
    });
  },[]);

  const toggleVisual=(key:typeof VISUAL_KEYS[number])=>{
    const patch:Partial<A11yState>={highContrast:false,negativeContrast:false,grayscale:false,blackWhite:false};
    (patch as Record<string,boolean>)[key]=!settings[key];
    update(patch);
  };

  const resetAll=()=>{
    localStorage.setItem(LS_KEY,JSON.stringify({...DEFAULT}));
    setSettings({...DEFAULT});
    applyState({...DEFAULT});
    window.speechSynthesis?.cancel();
  };

  const stopTTS=()=>{window.speechSynthesis?.cancel();};

  return (
    <>
      <a href="#main-content" className="a11y-skip">דלג לתוכן הראשי</a>
      <CookieBanner onStatement={()=>setShowStmt(true)}/>
      {showStmt&&<StatementModal onClose={()=>setShowStmt(false)}/>}

      {/* ── Floating toggle tab ───────────────────────────────────────── */}
      <div style={{position:'fixed',bottom:100,left:0,zIndex:77777,display:'flex',alignItems:'stretch'}}>
        <button
          onClick={()=>setOpen(o=>!o)}
          aria-label={open?'סגור תפריט נגישות':'פתח תפריט נגישות'}
          aria-expanded={open}
          aria-controls="a11y-panel"
          style={{
            writingMode:'vertical-rl',
            background:'linear-gradient(180deg,#1d4ed8,#3b82f6)',
            color:'#fff',border:'none',cursor:'pointer',
            padding:'17px 11px',borderRadius:'0 12px 12px 0',
            fontWeight:700,fontSize:13,letterSpacing:'0.06em',
            boxShadow:'4px 0 18px rgba(0,0,0,.2)',
            display:'flex',flexDirection:'column',alignItems:'center',gap:8,
            transition:'transform .2s, background .2s',
          }}
          onMouseEnter={e=>{e.currentTarget.style.background='linear-gradient(180deg,#1e40af,#2563eb)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='linear-gradient(180deg,#1d4ed8,#3b82f6)';}}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 22V12m0 0l-3-3m3 3l3-3"/>
            <path d="M9 22v-6a3 3 0 0 1 6 0v6"/>
          </svg>
          נגישות
        </button>
      </div>

      {/* ── Side Panel ───────────────────────────────────────────────── */}
      {open&&(
        <div
          id="a11y-panel"
          ref={panelRef}
          role="dialog"
          aria-label="תפריט נגישות"
          aria-modal="false"
          dir="rtl"
          className="a11y-panel-in"
          style={{
            position:'fixed',bottom:0,left:0,top:0,zIndex:77776,
            width:300,background:'#fff',
            boxShadow:'4px 0 32px rgba(0,0,0,.18)',
            display:'flex',flexDirection:'column',
            fontFamily:'Arial,Helvetica,sans-serif',
          }}
        >
          {/* Header */}
          <div style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',padding:'18px 16px',flexShrink:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="5" r="2"/><path d="M12 22V12m0 0l-3-3m3 3l3-3"/><path d="M9 22v-6a3 3 0 0 1 6 0v6"/>
                </svg>
                <span style={{color:'#fff',fontWeight:800,fontSize:16}}>כלי נגישות</span>
              </div>
              <button onClick={()=>setOpen(false)} aria-label="סגור תפריט נגישות"
                style={{background:'rgba(255,255,255,.2)',border:'none',borderRadius:8,
                        color:'#fff',cursor:'pointer',padding:'4px 10px',fontSize:18,lineHeight:1}}>✕</button>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={{flex:1,overflowY:'auto',padding:'14px 14px 20px'}}>

            {/* ── Visual ── */}
            <Divider label="הגדרות תצוגה"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:6}}>
              <Tile icon="🔆" label={'ניגודיות\nגבוהה'}    active={settings.highContrast}     onClick={()=>toggleVisual('highContrast')}/>
              <Tile icon="🌗" label={'ניגודיות\nהפוכה'}    active={settings.negativeContrast} onClick={()=>toggleVisual('negativeContrast')}/>
              <Tile icon="⬜" label={'גווני\nאפור'}         active={settings.grayscale}        onClick={()=>toggleVisual('grayscale')}/>
              <Tile icon="◼" label={'שחור\nלבן'}           active={settings.blackWhite}       onClick={()=>toggleVisual('blackWhite')}/>
            </div>

            {/* ── Actions ── */}
            <Divider label="פעולות"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6,marginBottom:6}}>
              <Tile icon="🔗" label={'הדגשת\nקישורים'} active={settings.highlightLinks} onClick={()=>update({highlightLinks:!settings.highlightLinks})}/>
              <Tile icon="🔊" label={'קורא\nמסך'}        active={settings.screenReader}   onClick={()=>update({screenReader:!settings.screenReader})}/>
            </div>

            {/* TTS controls */}
            {settings.screenReader&&(
              <div style={{background:'#eff6ff',borderRadius:10,padding:'10px 12px',marginBottom:8,border:'1px solid #bfdbfe'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:'#1d4ed8'}}>מהירות הקראה</span>
                  <button onClick={stopTTS}
                    style={{fontSize:10,background:'#fee2e2',color:'#dc2626',border:'none',
                            borderRadius:6,padding:'3px 8px',cursor:'pointer',fontWeight:700}}>
                    ⏹ עצור
                  </button>
                </div>
                <input type="range" min={0.5} max={2} step={0.1} value={settings.ttsRate}
                  onChange={e=>update({ttsRate:parseFloat(e.target.value)})}
                  style={{width:'100%',accentColor:'#1d4ed8'}}
                  aria-label="מהירות הקראה"/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#6b7280',marginTop:2}}>
                  <span>איטי</span><span style={{fontWeight:700}}>{settings.ttsRate.toFixed(1)}×</span><span>מהיר</span>
                </div>
              </div>
            )}

            {/* ── Font Size ── */}
            <Divider label="גודל גופן"/>
            <Stepper label="התאמת גודל גופן" value={settings.fontSize} unit="pt"
              defaultVal={0} min={-3} max={6}
              onSet={v=>update({fontSize:v})}/>

            {/* ── Word Spacing ── */}
            <Divider label="ריווח מילים"/>
            <Stepper label="התאמת ריווח בין מילים" value={settings.wordSpacing} unit="px"
              defaultVal={0} min={0} max={6}
              onSet={v=>update({wordSpacing:v})}/>

            {/* ── Letter Spacing ── */}
            <Divider label="ריווח אותיות"/>
            <Stepper label="התאמת ריווח בין אותיות" value={settings.letterSpacing} unit="px"
              defaultVal={0} min={0} max={5}
              onSet={v=>update({letterSpacing:v})}/>

            {/* ── Navigation ── */}
            <Divider label="כלי ניווט"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:6}}>
              <Tile icon="📌" label={'הדגשת\nכותרות'}    active={settings.highlightTitles}      onClick={()=>update({highlightTitles:!settings.highlightTitles})}/>
              <Tile icon="🖱️" label={'סמן גדול\nכהה'}    active={settings.bigCursor==='dark'}   onClick={()=>update({bigCursor:settings.bigCursor==='dark'?'none':'dark'})}/>
              <Tile icon="🖱️" label={'סמן גדול\nבהיר'}   active={settings.bigCursor==='light'}  onClick={()=>update({bigCursor:settings.bigCursor==='light'?'none':'light'})}/>
              <Tile icon="↺"  label={'איפוס\nהגדרות'}    active={false}                          onClick={resetAll}/>
            </div>
          </div>

          {/* Footer links */}
          <div style={{borderTop:'1px solid #f3f4f6',padding:'12px 14px',flexShrink:0,
                       display:'flex',flexDirection:'column',gap:6}}>
            <a href="/accessibility" style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',
                                             display:'flex',alignItems:'center',gap:6,fontWeight:600}}
              onClick={()=>setOpen(false)}>
              <span>📄</span> הצהרת נגישות
            </a>
            <a href="https://wa.me/972525830758" target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,color:'#16a34a',textDecoration:'none',display:'flex',alignItems:'center',gap:6,fontWeight:600}}>
              <span>💬</span> צריכים עזרה? דברו איתנו
            </a>
            <span style={{fontSize:10,color:'#9ca3af',marginTop:4}}>
              כלי נגישות — Tony Amramy Branding
            </span>
          </div>
        </div>
      )}
    </>
  );
}
