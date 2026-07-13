import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ShoppingBag, Sparkles } from 'lucide-react';

interface CheckoutSuccessProps {
  orderId: string | null;
  onContinueShopping: () => void;
}

export default function CheckoutSuccess({ orderId, onContinueShopping }: CheckoutSuccessProps) {
  const [particles] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.6,
      color: ['#1A1A18', '#2F2F2D', '#ffecd2', '#d4fc79', '#fbc2eb'][i % 5],
    }))
  );

  // Also read from URL if not passed as prop
  const displayOrderId = orderId ?? new URLSearchParams(window.location.search).get('orderId');

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" dir="rtl">
      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute w-3 h-3 rounded-full opacity-70"
            style={{ left: `${p.x}%`, backgroundColor: p.color, top: '-12px' }}
            animate={{ y: ['0vh', '110vh'], rotate: [0, 360], opacity: [0.7, 0] }}
            transition={{ duration: 2.5 + Math.random(), delay: p.delay, ease: 'linear', repeat: Infinity, repeatDelay: Math.random() * 4 }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="surface-card max-w-md w-full mx-auto text-center p-10 space-y-8 relative"
      >
        {/* Checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
          className="w-28 h-28 bg-green-50 border-4 border-green-200 rounded-full flex items-center justify-center mx-auto shadow-lg"
        >
          <CheckCircle2 size={56} className="text-green-500" />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles size={18} className="text-ink" />
            <h2 className="text-3xl font-bold text-gray-800">תודה על הרכישה!</h2>
            <Sparkles size={18} className="text-ink" />
          </div>
          <p className="text-lg text-gray-700 font-medium">התשלום התקבל בהצלחה</p>
          {displayOrderId && (
            <p className="text-sm text-gray-400 bg-gray-50 rounded-lg py-2 px-4 inline-block">
              מספר הזמנה: <span className="font-semibold text-gray-600">#{displayOrderId.slice(-6).toUpperCase()}</span>
            </p>
          )}
          <p className="text-gray-500 text-sm leading-relaxed pt-1">
            נכין את הזמנתך בהקדם וניצור קשר לתיאום המשלוח.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onContinueShopping}
          className="btn-primary w-full flex items-center justify-center gap-2 text-base py-4"
        >
          <ShoppingBag size={20} />
          המשך בקניות
        </motion.button>
      </motion.div>
    </div>
  );
}
