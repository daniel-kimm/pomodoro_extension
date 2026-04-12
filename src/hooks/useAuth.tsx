import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  total_study_seconds: number;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsOnboarding: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data as Profile);
      setNeedsOnboarding(false);
    } else {
      setProfile(null);
      setNeedsOnboarding(true);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Wait for Supabase's internal _initialize() to finish first.
      // This prevents racing with _recoverAndRefresh on the same refresh token.
      let { data: { session: s } } = await supabase.auth.getSession();

      // If no valid session, check if the background script stored OAuth tokens.
      if (!s) {
        const stored = await chrome.storage.local.get('pendingAuth');
        if (stored.pendingAuth?.access_token && stored.pendingAuth?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: stored.pendingAuth.access_token,
            refresh_token: stored.pendingAuth.refresh_token,
          });
          if (!error && data.session) {
            s = data.session;
          }
          // Only clear pendingAuth after a successful setSession
          if (!error) {
            await chrome.storage.local.remove('pendingAuth');
          }
        }
      }

      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchProfile(s.user.id);
      }
      if (mounted) setLoading(false);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setNeedsOnboarding(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl = chrome.identity.getRedirectURL();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) throw error ?? new Error('No OAuth URL returned');

    const response: { access_token?: string; refresh_token?: string; error?: string } =
      await chrome.runtime.sendMessage({
        type: 'GOOGLE_AUTH_FLOW',
        url: data.url,
      });

    if (response?.error) throw new Error(response.error);

    if (response?.access_token && response?.refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: response.access_token,
        refresh_token: response.refresh_token,
      });
      if (sessionError) throw sessionError;
      await chrome.storage.local.remove('pendingAuth');
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setNeedsOnboarding(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        needsOnboarding,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
