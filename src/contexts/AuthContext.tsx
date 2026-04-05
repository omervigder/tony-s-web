import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '../firebase';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isAdmin: false, loading: true });

// Only invoke the server-side claim grant when actually on an admin route
const IS_ADMIN_ROUTE = window.location.pathname.startsWith('/admin');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true); // re-arm on every state change to prevent flash
      if (firebaseUser) {
        try {
          // Fast path: token already carries the admin claim
          const current = await firebaseUser.getIdTokenResult(false);
          if (current.claims['admin'] === true) {
            setIsAdmin(true);
          } else if (IS_ADMIN_ROUTE) {
            // Slow path (admin route only): ask server to check whitelist and set claim
            const fn = httpsCallable(getFunctions(app), 'grantAdminIfWhitelisted');
            await fn({});
            // Force-refresh so the newly-set claim lands in the token
            const refreshed = await firebaseUser.getIdTokenResult(true);
            setIsAdmin(refreshed.claims['admin'] === true);
          } else {
            setIsAdmin(false);
          }
        } catch {
          setIsAdmin(false);
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
