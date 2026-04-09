import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.full_name ?? ''
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      setError('Only lowercase letters, numbers, and underscores');
      return;
    }

    setError(null);
    setSaving(true);

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: trimmed,
      display_name: displayName.trim() || null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      total_study_seconds: 0,
    });

    if (insertError) {
      setSaving(false);
      if (insertError.code === '23505') {
        setError('Username is already taken');
      } else {
        setError(insertError.message);
      }
      return;
    }

    await refreshProfile();
    setSaving(false);
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-header">
        <div className="auth-icon" aria-hidden>👋</div>
        <h1 className="auth-title">Welcome!</h1>
        <p className="auth-subtitle">Set up your profile to get started</p>
      </div>

      <form className="onboarding-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="onb-username">Username</label>
          <input
            id="onb-username"
            type="text"
            className="input-field"
            placeholder="e.g. studyking99"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="onb-display">Display Name</label>
          <input
            id="onb-display"
            type="text"
            className="input-field"
            placeholder="How friends see you"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Creating profile…' : 'Get Started'}
        </button>
      </form>
    </div>
  );
}
