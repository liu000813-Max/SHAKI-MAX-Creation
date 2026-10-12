'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface SessionUser {
  email: string;
  name?: string;
}

export interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  isSupabaseConfigured: boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const SESSION_KEY = 'shaki_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseConfigured = !!(
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        /* ignore malformed session */
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    // Local-first auth for the Phase 04 UI batch.
    // When Supabase is configured (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY present),
    // swap this block for: supabase.auth.signInWithPassword({ email, password }).
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: 'invalid_email' };
    }
    if (!password || password.length < 4) {
      return { ok: false, error: 'invalid_password' };
    }
    const session: SessionUser = { email, name: email.split('@')[0] };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return { ok: true };
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
