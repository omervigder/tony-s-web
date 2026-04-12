import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  accessDenied: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isAdmin: false, loading: true, accessDenied: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]             = useState<User | null>(null);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser?.email) {
        // Clear any prior access-denied message on each new sign-in attempt
        setAccessDenied(false);
        try {
          const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.email));
          if (adminDoc.exists() && adminDoc.data()?.role === 'admin') {
            setUser(firebaseUser);
            setIsAdmin(true);
            setLoading(false);
          } else {
            // Not in the admin whitelist — flag it then sign out
            setAccessDenied(true);
            await signOut(auth);
            // onAuthStateChanged fires again with null — that callback sets loading=false
          }
        } catch {
          setUser(firebaseUser);
          setIsAdmin(false);
          setLoading(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, accessDenied }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
