import { useState, useEffect, useCallback } from 'react';
import { useAuth, type Profile } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

function formatStudyTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    const { data: sentFriends } = await supabase
      .from('friendships')
      .select('addressee_id')
      .eq('requester_id', user.id)
      .eq('status', 'accepted');

    const { data: receivedFriends } = await supabase
      .from('friendships')
      .select('requester_id')
      .eq('addressee_id', user.id)
      .eq('status', 'accepted');

    const friendIds = [
      ...(sentFriends ?? []).map((f) => f.addressee_id as string),
      ...(receivedFriends ?? []).map((f) => f.requester_id as string),
      user.id,
    ];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds)
      .order('total_study_seconds', { ascending: false });

    setEntries((profiles ?? []) as Profile[]);
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  if (loading) {
    return (
      <div className="leaderboard-page">
        <div className="leaderboard-loading">Loading leaderboard…</div>
      </div>
    );
  }

  const userRank = entries.findIndex((e) => e.id === user?.id) + 1;

  return (
    <div className="leaderboard-page">
      {/* User stats card */}
      {profile && (
        <div className="leaderboard-me">
          <div className="leaderboard-me__rank">#{userRank || '—'}</div>
          <div className="leaderboard-me__info">
            <span className="leaderboard-me__name">
              {profile.display_name || profile.username}
            </span>
            <span className="leaderboard-me__time">
              {formatStudyTime(profile.total_study_seconds)}
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard list */}
      <div className="leaderboard-list">
        {entries.length === 0 ? (
          <div className="friends-empty">
            <p>Add friends to see the leaderboard</p>
          </div>
        ) : (
          entries.map((entry, index) => {
            const rank = index + 1;
            const isMe = entry.id === user?.id;
            return (
              <div
                key={entry.id}
                className={'leaderboard-row' + (isMe ? ' leaderboard-row--me' : '')}
              >
                <div
                  className={
                    'leaderboard-row__rank' +
                    (rank === 1
                      ? ' leaderboard-row__rank--gold'
                      : rank === 2
                        ? ' leaderboard-row__rank--silver'
                        : rank === 3
                          ? ' leaderboard-row__rank--bronze'
                          : '')
                  }
                >
                  {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </div>
                <div className="leaderboard-row__avatar">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" />
                  ) : (
                    <span>
                      {(entry.display_name || entry.username)[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="leaderboard-row__info">
                  <span className="leaderboard-row__name">
                    {entry.display_name || entry.username}
                    {isMe && <span className="leaderboard-row__you"> (you)</span>}
                  </span>
                  <span className="leaderboard-row__username">@{entry.username}</span>
                </div>
                <div className="leaderboard-row__time">
                  {formatStudyTime(entry.total_study_seconds)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
