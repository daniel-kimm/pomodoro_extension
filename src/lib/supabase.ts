import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    const result = await chrome.storage.local.get(key);
    return (result[key] as string) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
