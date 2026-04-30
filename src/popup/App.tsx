import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import FriendsPage from './pages/FriendsPage';
import LeaderboardPage from './pages/LeaderboardPage';

type Tab = 'timer' | 'friends' | 'leaderboard';

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13V8" />
      <path d="M12 13l3 2" />
      <path d="M9 2h6" />
      <path d="M12 2v3" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 5" />
      <path d="M16 6h3a3 3 0 0 1-3 5" />
      <path d="M12 14v4" />
      <path d="M9 20h6" />
    </svg>
  );
}

function App() {
  const { user, profile, loading, needsOnboarding, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('timer');

  if (loading) {
    return (
      <div className="popup">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="popup">
        <AuthPage />
      </div>
    );
  }

  if (needsOnboarding || !profile) {
    return (
      <div className="popup">
        <OnboardingPage />
      </div>
    );
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="popup-header__brand">
          <div className="popup-header__text">
            <h1>Pomodoro Study</h1>
            <p>
              {activeTab === 'timer'
                ? 'Focus sessions that keep running in the background'
                : activeTab === 'friends'
                  ? 'Manage your study friends'
                  : 'Friend leaderboard'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="header-signout"
          onClick={signOut}
          title="Sign out"
        >
          Sign out
        </button>
      </header>

      <main className="popup-main">
        {activeTab === 'timer' && <HomePage />}
        {activeTab === 'friends' && <FriendsPage />}
        {activeTab === 'leaderboard' && <LeaderboardPage />}
      </main>

      <nav className="bottom-nav">
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'timer' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('timer')}
        >
          <span className="bottom-nav__icon">
            <TimerIcon />
          </span>
          <span className="bottom-nav__label">Timer</span>
        </button>
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'friends' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('friends')}
        >
          <span className="bottom-nav__icon">
            <FriendsIcon />
          </span>
          <span className="bottom-nav__label">Friends</span>
        </button>
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'leaderboard' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="bottom-nav__icon">
            <TrophyIcon />
          </span>
          <span className="bottom-nav__label">Board</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
