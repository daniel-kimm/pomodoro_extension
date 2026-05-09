import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import FriendsPage from './pages/FriendsPage';
import GroupSessionPage from './pages/GroupSessionPage';
import LeaderboardPage from './pages/LeaderboardPage';
import SettingsPage from './pages/SettingsPage';
import onTaskLogo from './assets/on-task-logo.png';

type Tab = 'timer' | 'friends' | 'group' | 'leaderboard' | 'settings';

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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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
            <img className="app-logo app-logo--header" src={onTaskLogo} alt="On Task" />
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
        {activeTab === 'group' && <GroupSessionPage />}
        {activeTab === 'leaderboard' && <LeaderboardPage />}
        {activeTab === 'settings' && <SettingsPage />}
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
          className={'bottom-nav__item' + (activeTab === 'group' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('group')}
        >
          <span className="bottom-nav__icon">➕</span>
          <span className="bottom-nav__label">Group</span>
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
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'settings' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('settings')}
        >
          <span className="bottom-nav__icon">
            <SettingsIcon />
          </span>
          <span className="bottom-nav__label">Settings</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
