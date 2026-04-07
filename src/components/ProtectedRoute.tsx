import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-[#FFF5F7] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#ff9a9e' }} />
    </div>
  );

  if (user && !isAdmin) return (
    <div dir="rtl" className="min-h-screen bg-[#FFF5F7] flex items-center justify-center p-4">
      <div className="bg-white border border-[#fce4ec] rounded-2xl p-8 text-center max-w-sm w-full shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">⛔</div>
        <h2 className="text-[#3a3a3a] text-xl font-bold mb-2">אין הרשאה</h2>
        <p className="text-gray-500 text-sm mb-6">המשתמש שלך אינו מוגדר כמנהל.</p>
        <button
          onClick={() => { window.location.href = '/'; }}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-[#3a3a3a] bg-[#FFF5F7] border border-[#fce4ec] hover:border-[#ff9a9e]/40 transition-colors"
        >
          חזרה לדף הבית
        </button>
      </div>
    </div>
  );

  return <>{children}</>;
}
