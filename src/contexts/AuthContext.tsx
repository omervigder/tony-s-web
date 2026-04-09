import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isAdmin: false, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          // Only force-refresh if the token expires in < 5 min (avoids unnecessary network call on every load)
          const token = await firebaseUser.getIdTokenResult(false);
          const expiresAt = new Date(token.expirationTime).getTime();
          const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000;
          const finalToken = needsRefresh
            ? await firebaseUser.getIdTokenResult(true)
            : token;
          setIsAdmin(finalToken.claims['admin'] === true);
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
