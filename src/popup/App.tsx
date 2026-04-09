import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import FriendsPage from './pages/FriendsPage';
import LeaderboardPage from './pages/LeaderboardPage';

type Tab = 'timer' | 'friends' | 'leaderboard';

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
          <div className="popup-header__icon" aria-hidden>
            🍅
          </div>
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
          <span className="bottom-nav__icon">⏱</span>
          <span className="bottom-nav__label">Timer</span>
        </button>
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'friends' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('friends')}
        >
          <span className="bottom-nav__icon">👥</span>
          <span className="bottom-nav__label">Friends</span>
        </button>
        <button
          type="button"
          className={'bottom-nav__item' + (activeTab === 'leaderboard' ? ' bottom-nav__item--active' : '')}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="bottom-nav__icon">🏆</span>
          <span className="bottom-nav__label">Board</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
