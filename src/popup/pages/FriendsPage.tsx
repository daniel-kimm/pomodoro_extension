import { useState, useEffect, useCallback } from 'react';
import { useAuth, type Profile } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
}

type FriendRow = Friendship & { profile: Profile };

export default function FriendsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'friends' | 'requests'>('friends');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!user) return;

    const { data: sent } = await supabase
      .from('friendships')
      .select('*')
      .eq('requester_id', user.id)
      .eq('status', 'accepted');

    const { data: received } = await supabase
      .from('friendships')
      .select('*')
      .eq('addressee_id', user.id)
      .eq('status', 'accepted');

    const all = [...(sent ?? []), ...(received ?? [])] as Friendship[];
    const friendIds = all.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    if (friendIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', friendIds);

      const profileMap = new Map((profiles ?? []).map((p: Profile) => [p.id, p]));
      setFriends(
        all
          .map((f) => {
            const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
            return { ...f, profile: profileMap.get(friendId)! };
          })
          .filter((f) => f.profile)
      );
    } else {
      setFriends([]);
    }
  }, [user]);

  const loadIncoming = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('friendships')
      .select('*')
      .eq('addressee_id', user.id)
      .eq('status', 'pending');

    const requests = (data ?? []) as Friendship[];
    const requesterIds = requests.map((r) => r.requester_id);

    if (requesterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', requesterIds);

      const profileMap = new Map((profiles ?? []).map((p: Profile) => [p.id, p]));
      setIncoming(
        requests
          .map((r) => ({ ...r, profile: profileMap.get(r.requester_id)! }))
          .filter((r) => r.profile)
      );
    } else {
      setIncoming([]);
    }
  }, [user]);

  useEffect(() => {
    loadFriends();
    loadIncoming();
  }, [loadFriends, loadIncoming]);

  const handleSearch = async () => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || !user) return;
    setSearching(true);

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${q}%`)
      .neq('id', user.id)
      .limit(10);

    setSearchResults((data ?? []) as Profile[]);
    setSearching(false);
  };

  const sendRequest = async (addresseeId: string) => {
    if (!user) return;
    setActionLoading(addresseeId);

    await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: addresseeId,
    });

    setSearchResults((prev) => prev.filter((p) => p.id !== addresseeId));
    setActionLoading(null);
  };

  const acceptRequest = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    await loadFriends();
    await loadIncoming();
    setActionLoading(null);
  };

  const declineRequest = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    await supabase.from('friendships').delete().eq('id', friendshipId);

    await loadIncoming();
    setActionLoading(null);
  };

  const removeFriend = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    await supabase.from('friendships').delete().eq('id', friendshipId);

    await loadFriends();
    setActionLoading(null);
  };

  const isFriendOrPending = (profileId: string): string | null => {
    const inFriends = friends.find((f) => f.profile.id === profileId);
    if (inFriends) return 'friends';
    const inIncoming = incoming.find((r) => r.profile.id === profileId);
    if (inIncoming) return 'pending';
    return null;
  };

  return (
    <div className="friends-page">
      {/* Search */}
      <div className="friends-search">
        <div className="friends-search__row">
          <input
            type="text"
            className="input-field"
            placeholder="Search by username…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 2}
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((p) => {
              const relation = isFriendOrPending(p.id);
              return (
                <div key={p.id} className="friend-card">
                  <div className="friend-card__avatar">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" />
                    ) : (
                      <span>{(p.display_name || p.username)[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="friend-card__info">
                    <span className="friend-card__name">
                      {p.display_name || p.username}
                    </span>
                    <span className="friend-card__username">@{p.username}</span>
                  </div>
                  {relation === 'friends' ? (
                    <span className="friend-card__badge">Friends</span>
                  ) : relation === 'pending' ? (
                    <span className="friend-card__badge">Pending</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => sendRequest(p.id)}
                      disabled={actionLoading === p.id}
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="friends-tabs">
        <button
          type="button"
          className={'friends-tab' + (tab === 'friends' ? ' friends-tab--active' : '')}
          onClick={() => setTab('friends')}
        >
          Friends{friends.length > 0 ? ` (${friends.length})` : ''}
        </button>
        <button
          type="button"
          className={'friends-tab' + (tab === 'requests' ? ' friends-tab--active' : '')}
          onClick={() => setTab('requests')}
        >
          Requests
          {incoming.length > 0 && (
            <span className="friends-tab__badge">{incoming.length}</span>
          )}
        </button>
      </div>

      {/* Friends list */}
      {tab === 'friends' && (
        <div className="friends-list">
          {friends.length === 0 ? (
            <div className="friends-empty">
              <p>No friends yet</p>
              <p className="friends-empty__hint">Search for users above to add friends</p>
            </div>
          ) : (
            friends.map((f) => (
              <div key={f.id} className="friend-card">
                <div className="friend-card__avatar">
                  {f.profile.avatar_url ? (
                    <img src={f.profile.avatar_url} alt="" />
                  ) : (
                    <span>
                      {(f.profile.display_name || f.profile.username)[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="friend-card__info">
                  <span className="friend-card__name">
                    {f.profile.display_name || f.profile.username}
                  </span>
                  <span className="friend-card__username">@{f.profile.username}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeFriend(f.id)}
                  disabled={actionLoading === f.id}
                  title="Remove friend"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Requests list */}
      {tab === 'requests' && (
        <div className="friends-list">
          {incoming.length === 0 ? (
            <div className="friends-empty">
              <p>No pending requests</p>
            </div>
          ) : (
            incoming.map((r) => (
              <div key={r.id} className="friend-card">
                <div className="friend-card__avatar">
                  {r.profile.avatar_url ? (
                    <img src={r.profile.avatar_url} alt="" />
                  ) : (
                    <span>
                      {(r.profile.display_name || r.profile.username)[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="friend-card__info">
                  <span className="friend-card__name">
                    {r.profile.display_name || r.profile.username}
                  </span>
                  <span className="friend-card__username">@{r.profile.username}</span>
                </div>
                <div className="friend-card__actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => acceptRequest(r.id)}
                    disabled={actionLoading === r.id}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => declineRequest(r.id)}
                    disabled={actionLoading === r.id}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
