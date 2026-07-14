import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AdminLogin from '../pages/AdminLogin';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#1A1A18' }} />
    </div>
  );

  if (!user || !isAdmin) return <AdminLogin />;

  return <>{children}</>;
}
