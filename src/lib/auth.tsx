import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { appUrl, isBackendConfigured } from './config';

interface AuthCtx {
  configured: boolean;
  ready: boolean;
  user: User | null;
  session: Session | null;
  signUp(email: string, password: string): Promise<string>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<void>;
  setNewPassword(pw: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  changeEmail(email: string): Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

const need = async () => {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are off: this copy of HYBRD is not connected to a backend yet (Local mode).');
  return sb;
};
const friendly = (e: { message?: string } | null) => {
  if (!e) return;
  const m = e.message || 'Something went wrong';
  if (/invalid login/i.test(m)) throw new Error('Email or password is incorrect.');
  if (/email not confirmed/i.test(m)) throw new Error('Confirm your email first — check your inbox for the link.');
  throw new Error(m);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isBackendConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) return;
    let unsub: (() => void) | undefined;
    getSupabase().then(async (sb) => {
      if (!sb) { setReady(true); return; }
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      setReady(true);
      const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => setSession(s));
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, [configured]);

  const value: AuthCtx = {
    configured, ready, session, user: session?.user ?? null,
    async signUp(email, password) {
      const sb = await need();
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
      friendly(error);
      return data.session ? 'signed-in' : 'confirm-email';
    },
    async signIn(email, password) {
      const sb = await need();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      friendly(error);
    },
    async signOut() { const sb = await need(); await sb.auth.signOut(); },
    async sendReset(email) {
      const sb = await need();
      // Land on the app root (always a real 200 page on GitHub Pages); the app then routes to /reset-password.
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() + '?next=reset-password' });
      friendly(error);
    },
    async setNewPassword(pw) {
      const sb = await need();
      const { error } = await sb.auth.updateUser({ password: pw });
      friendly(error);
    },
    async changePassword(current, next) {
      const sb = await need();
      const email = session?.user?.email;
      if (!email) throw new Error('Sign in first.');
      const { error: e1 } = await sb.auth.signInWithPassword({ email, password: current });
      if (e1) throw new Error('Current password is incorrect.');
      const { error } = await sb.auth.updateUser({ password: next });
      friendly(error);
    },
    async changeEmail(email) {
      const sb = await need();
      const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: appUrl() + '?next=account' });
      friendly(error);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
