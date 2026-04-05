import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-[#070712] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-[#F5C518]" />
    </div>
  );

  if (user && !isAdmin) return (
    <div dir="rtl" className="min-h-screen bg-[#070712] flex items-center justify-center p-4">
      <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-8 text-center max-w-sm w-full">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-2xl">⛔</div>
        <h2 className="text-white text-xl font-bold mb-2">אין הרשאה</h2>
        <p className="text-gray-400 text-sm mb-6">המשתמש שלך אינו מוגדר כמנהל.</p>
        <button
          onClick={() => { window.location.href = '/'; }}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-gray-300 bg-[#070712] border border-[#252550] hover:border-[#F5C518]/40 transition-colors"
        >
          חזרה לדף הבית
        </button>
      </div>
    </div>
  );

  // !user case: pass through to Admin.tsx which renders the Google login screen
  return <>{children}</>;
}
