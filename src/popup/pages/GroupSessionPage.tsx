import React, { useCallback, useEffect, useState } from 'react';
import { useAuth, type Profile } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

interface GroupSession {
  id: string;
  owner_id: string;
  task: string;
  duration_seconds: number;
  started_at: string;
  is_active: boolean;
}

export default function GroupSessionPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupTask, setGroupTask] = useState<string>('');
  const [studyTimer, setStudyTimer] = useState<number>(25);
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(25 * 60);
  const [sessionStarted, setSessionStarted] = useState<boolean>(false);

  const persist = (partial: Record<string, unknown>, done?: () => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      if (done) chrome.storage.local.set(partial, done);
      else chrome.storage.local.set(partial);
    } else {
      done?.();
    }
  };

  const sendTimerMessage = (type: 'START_TIMER' | 'PAUSE_TIMER' | 'RESUME_TIMER' | 'RESET_TIMER'): void => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type });
    }
  };

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

    const all = [...(sent ?? []), ...(received ?? [])] as Array<{
      id: string;
      requester_id: string;
      addressee_id: string;
    }>;

    const friendIds = all.map((friend) =>
      friend.requester_id === user.id ? friend.addressee_id : friend.requester_id
    );

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds);

    setFriends((profiles ?? []) as Profile[]);
  }, [user]);

  const loadGroupMembers = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('study_session_members')
      .select('profile:profile_id(*)')
      .eq('session_id', sessionId)
      .is('left_at', null);

    setGroupMembers(
      (data ?? [])
        .map((member) => member.profile)
        .filter((profile): profile is Profile => Boolean(profile))
    );
  }, []);

  const loadActiveGroupSession = useCallback(async () => {
    if (!user) return;

    const membershipResult = await supabase
      .from('study_session_members')
      .select('*, session:session_id(*)')
      .eq('profile_id', user.id)
      .is('left_at', null)
      .limit(1);

    if (!membershipResult.data || membershipResult.error || membershipResult.data.length === 0) {
      setGroupSession(null);
      setGroupMembers([]);
      return;
    }

    const membership = membershipResult.data[0];
    const session = membership?.session as GroupSession | null;
    if (!session || !session.is_active) {
      setGroupSession(null);
      setGroupMembers([]);
      return;
    }

    setGroupSession(session);
    await loadGroupMembers(session.id);
  }, [user, loadGroupMembers]);

  useEffect(() => {
    loadFriends();
    loadActiveGroupSession();
  }, [loadFriends, loadActiveGroupSession]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`group-session-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_session_members',
          filter: `profile_id=eq.${user.id}`,
        },
        () => {
          loadActiveGroupSession();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_sessions',
        },
        () => {
          loadActiveGroupSession();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, loadActiveGroupSession]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
  };

  const inviteFriendsToSession = async () => {
    if (!groupSession || !user) return;

    const newMemberIds = selectedFriendIds.filter(
      (id) => !groupMembers.some((member) => member.id === id)
    );
    if (newMemberIds.length === 0) {
      alert('Select friends who are not already in the session.');
      return;
    }

    setGroupLoading(true);
    const { error } = await supabase.from('study_session_members').insert(
      newMemberIds.map((profile_id) => ({
        session_id: groupSession.id,
        profile_id,
      }))
    );

    if (error) {
      setGroupLoading(false);
      alert('Unable to invite friends to the group session. Please try again.');
      return;
    }

    setSelectedFriendIds([]);
    await loadGroupMembers(groupSession.id);
    setGroupLoading(false);
  };

  const createGroupSession = async () => {
    if (!user) return;

    const sessionTopic = groupTask.trim() || 'Group study session';
    setGroupLoading(true);
    const initialTime = studyTimer * 60;

    const { data: sessionData, error: sessionError } = await supabase
      .from('study_sessions')
      .insert({
        owner_id: user.id,
        task: sessionTopic,
        duration_seconds: initialTime,
        started_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id, owner_id, task, duration_seconds, started_at, is_active')
      .single();

    if (sessionError || !sessionData) {
      setGroupLoading(false);
      alert('Unable to create group session. Please try again.');
      return;
    }

    const memberIds = Array.from(new Set([user.id, ...selectedFriendIds]));
    const { error: memberError } = await supabase.from('study_session_members').insert(
      memberIds.map((profile_id) => ({
        session_id: sessionData.id,
        profile_id,
      }))
    );

    if (memberError) {
      setGroupLoading(false);
      alert('Unable to invite friends to the group session. Please try again.');
      return;
    }

    setGroupSession(sessionData);
    await loadGroupMembers(sessionData.id);
    setSelectedFriendIds([]);

    setSessionStarted(true);
    setIsRunning(true);
    setTimeRemaining(initialTime);
    persist(
      {
        sessionStarted: true,
        isRunning: true,
        timeRemaining: initialTime,
        studyTimer,
        task: sessionTopic,
      },
      () => sendTimerMessage('START_TIMER')
    );

    setGroupLoading(false);
  };

  const leaveGroupSession = async () => {
    if (!groupSession || !user) return;
    await supabase
      .from('study_session_members')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', groupSession.id)
      .eq('profile_id', user.id);

    setGroupSession(null);
    setGroupMembers([]);
  };

  return (
    <div className="group-session-page">
      <div className="page-heading">
        <h2>Group Sessions</h2>
        <p>Start the shared group timer here. Each person can still set their own task in the Timer tab.</p>
      </div>

      {groupSession ? (
        <div className="group-session-active">
          <div className="group-session-card">
            <div>
              <p className="label">Current group session</p>
              <h3>{groupSession.task}</h3>
              <p>{Math.ceil(groupSession.duration_seconds / 60)} minutes</p>
              <p>{groupMembers.length} member{groupMembers.length === 1 ? '' : 's'} active</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={leaveGroupSession}>
              Leave group session
            </button>
          </div>

          <div className="group-invite-section">
            <p className="label">Invite more friends</p>
            {friends.filter((friend) => !groupMembers.some((member) => member.id === friend.id)).length === 0 ? (
              <p>Everyone in your friends list is already in this session.</p>
            ) : (
              <div className="invite-list">
                {friends
                  .filter((friend) => !groupMembers.some((member) => member.id === friend.id))
                  .map((friend) => {
                    const selected = selectedFriendIds.includes(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        className={
                          'invite-pill' + (selected ? ' invite-pill--selected' : '')
                        }
                        onClick={() => toggleFriend(friend.id)}
                      >
                        {friend.display_name || friend.username}
                      </button>
                    );
                  })}
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={groupLoading || selectedFriendIds.length === 0}
              onClick={inviteFriendsToSession}
            >
              {groupLoading ? 'Inviting…' : 'Invite selected friends'}
            </button>
          </div>

          <div className="group-members-list">
            {groupMembers.map((member) => (
              <div key={member.id} className="friend-card">
                <div className="friend-card__avatar">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" />
                  ) : (
                    <span>{(member.display_name || member.username)[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="friend-card__info">
                  <span className="friend-card__name">
                    {member.display_name || member.username}
                  </span>
                  <span className="friend-card__username">@{member.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="group-session-setup">
          <div className="form-group">
            <label htmlFor="group-task">Group session topic (optional)</label>
            <input
              id="group-task"
              type="text"
              value={groupTask}
              onChange={(e) => setGroupTask(e.target.value)}
              placeholder="e.g. Study for chem exam"
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="group-timer">Session length (minutes)</label>
            <input
              id="group-timer"
              type="number"
              min="1"
              max="120"
              value={studyTimer}
              onChange={(e) => setStudyTimer(Number(e.target.value))}
              className="input-field"
            />
          </div>

          <div className="form-group">
            <p className="label">Invite friends</p>
            {friends.length === 0 ? (
              <p>You can start a group session now and invite friends later.</p>
            ) : (
              <div className="invite-list">
                {friends.map((friend) => {
                  const selected = selectedFriendIds.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      className={
                        'invite-pill' + (selected ? ' invite-pill--selected' : '')
                      }
                      onClick={() => toggleFriend(friend.id)}
                    >
                      {friend.display_name || friend.username}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={createGroupSession}
            disabled={groupLoading}
          >
            {groupLoading ? 'Starting group session…' : 'Start group session'}
          </button>
        </div>
      )}
    </div>
  );
}
