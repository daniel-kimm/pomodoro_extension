import { useCallback, useEffect, useState } from 'react';
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

interface GroupSessionInvite {
  id: string;
  session_id: string;
  session: GroupSession;
  inviter: Profile | null;
}

const ACCEPTED_GROUP_SESSION_IDS_KEY = 'acceptedGroupSessionIds';
const DECLINED_GROUP_SESSION_IDS_KEY = 'declinedGroupSessionIds';

export default function GroupSessionPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupTask, setGroupTask] = useState<string>('');
  const [studyTimer, setStudyTimer] = useState<number>(25);
  const [studyTimerInput, setStudyTimerInput] = useState<string>('25');
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupSessionInvite[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  const persist = (partial: Record<string, unknown>, done?: () => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      if (done) chrome.storage.local.set(partial, done);
      else chrome.storage.local.set(partial);
    } else {
      done?.();
    }
  };

  const getAcceptedGroupSessionIds = useCallback((): Promise<string[]> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve([]);
        return;
      }

      chrome.storage.local.get([ACCEPTED_GROUP_SESSION_IDS_KEY], (result) => {
        const ids = result[ACCEPTED_GROUP_SESSION_IDS_KEY];
        resolve(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
      });
    });
  }, []);

  const saveAcceptedGroupSessionIds = useCallback((sessionIds: string[]): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve();
        return;
      }

      chrome.storage.local.set(
        { [ACCEPTED_GROUP_SESSION_IDS_KEY]: Array.from(new Set(sessionIds)) },
        resolve
      );
    });
  }, []);

  const getDeclinedGroupSessionIds = useCallback((): Promise<string[]> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve([]);
        return;
      }

      chrome.storage.local.get([DECLINED_GROUP_SESSION_IDS_KEY], (result) => {
        const ids = result[DECLINED_GROUP_SESSION_IDS_KEY];
        resolve(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
      });
    });
  }, []);

  const saveDeclinedGroupSessionIds = useCallback((sessionIds: string[]): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve();
        return;
      }

      chrome.storage.local.set(
        { [DECLINED_GROUP_SESSION_IDS_KEY]: Array.from(new Set(sessionIds)) },
        resolve
      );
    });
  }, []);

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

    const profiles = (data ?? [])
      .map((member) => member.profile)
      .flat()
      .filter((profile): profile is Profile => Boolean(profile));

    setGroupMembers(profiles);
  }, []);

  const loadActiveGroupSession = useCallback(async () => {
    if (!user) return;

    const acceptedSessionIds = await getAcceptedGroupSessionIds();
    const declinedSessionIds = await getDeclinedGroupSessionIds();

    const membershipResult = await supabase
      .from('study_session_members')
      .select('*, session:session_id(*)')
      .eq('profile_id', user.id)
      .is('left_at', null);

    if (!membershipResult.data || membershipResult.error || membershipResult.data.length === 0) {
      setGroupSession(null);
      setGroupMembers([]);
      setGroupInvites([]);
      return;
    }

    const memberships = membershipResult.data as Array<{
      id: string;
      session_id: string;
      session: GroupSession | GroupSession[] | null;
    }>;
    const ownerIds = Array.from(
      new Set(
        memberships
          .map((membership) => {
            const session = Array.isArray(membership.session)
              ? membership.session[0]
              : membership.session;

            return session?.owner_id;
          })
          .filter((id): id is string => typeof id === 'string' && id !== user.id)
      )
    );
    const { data: owners } = ownerIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', ownerIds)
      : { data: [] };
    const ownersById = new Map(
      ((owners ?? []) as Profile[]).map((owner) => [owner.id, owner])
    );
    const sessions = memberships
      .map((membership) => {
        const session = Array.isArray(membership.session)
          ? membership.session[0]
          : membership.session;

        return session?.is_active
          ? {
              id: membership.id,
              session_id: membership.session_id,
              session,
              inviter: ownersById.get(session.owner_id) ?? null,
            }
          : null;
      })
      .filter((invite): invite is GroupSessionInvite => Boolean(invite));
    const visibleSessions = sessions.filter(
      (invite) => !declinedSessionIds.includes(invite.session.id)
    );

    const joinedInvite = visibleSessions.find((invite) =>
      invite.session.owner_id === user.id || acceptedSessionIds.includes(invite.session.id)
    );

    setGroupInvites(visibleSessions.filter((invite) => invite.session.id !== joinedInvite?.session.id));

    if (!joinedInvite) {
      setGroupSession(null);
      setGroupMembers([]);
      return;
    }

    setGroupSession(joinedInvite.session);
    await loadGroupMembers(joinedInvite.session.id);
  }, [user, getAcceptedGroupSessionIds, getDeclinedGroupSessionIds, loadGroupMembers]);

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
    if (groupSession.owner_id !== user.id) {
      alert('Only the session owner can invite more friends.');
      return;
    }

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
    const { error: sessionError } = await supabase
      .from('study_sessions')
      .update({ is_active: false })
      .eq('id', groupSession.id);

    if (sessionError) {
      alert('Unable to end this group session. Please try again.');
      return;
    }

    const { error } = await supabase
      .from('study_session_members')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', groupSession.id)
      .eq('profile_id', user.id);

    if (error) {
      alert('Unable to leave this group session. Please try again.');
      return;
    }

    setGroupSession(null);
    setGroupMembers([]);
    setSelectedFriendIds([]);
    const acceptedSessionIds = await getAcceptedGroupSessionIds();
    await saveAcceptedGroupSessionIds(
      acceptedSessionIds.filter((sessionId) => sessionId !== groupSession.id)
    );
    const declinedSessionIds = await getDeclinedGroupSessionIds();
    await saveDeclinedGroupSessionIds([...declinedSessionIds, groupSession.id]);
  };

  const acceptGroupInvite = async (invite: GroupSessionInvite) => {
    setInviteActionId(invite.id);
    const acceptedSessionIds = await getAcceptedGroupSessionIds();
    await saveAcceptedGroupSessionIds([...acceptedSessionIds, invite.session.id]);
    setGroupSession(invite.session);
    setGroupInvites((current) => current.filter((item) => item.id !== invite.id));
    await loadGroupMembers(invite.session.id);
    setInviteActionId(null);
  };

  const declineGroupInvite = async (invite: GroupSessionInvite) => {
    if (!user) return;

    setInviteActionId(invite.id);
    const acceptedSessionIds = await getAcceptedGroupSessionIds();
    const declinedSessionIds = await getDeclinedGroupSessionIds();
    await saveAcceptedGroupSessionIds(
      acceptedSessionIds.filter((sessionId) => sessionId !== invite.session.id)
    );
    await saveDeclinedGroupSessionIds([...declinedSessionIds, invite.session.id]);

    const { error } = await supabase
      .from('study_session_members')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', invite.session_id)
      .eq('profile_id', user.id);

    if (error) {
      console.error('Unable to decline group invite:', error);
    }

    setGroupInvites((current) => current.filter((item) => item.id !== invite.id));
    setInviteActionId(null);
  };

  const clampStudyTimer = (minutes: number): number => {
    return Math.min(120, Math.max(1, minutes));
  };

  const commitStudyTimerInput = () => {
    const n = parseInt(studyTimerInput, 10);
    const clamped = Number.isNaN(n) ? 25 : clampStudyTimer(n);
    setStudyTimer(clamped);
    setStudyTimerInput(String(clamped));
  };

  const stepStudyTimer = (delta: number) => {
    const parsed = parseInt(studyTimerInput, 10);
    const current = Number.isNaN(parsed) ? studyTimer : parsed;
    const next = clampStudyTimer(current + delta);
    setStudyTimer(next);
    setStudyTimerInput(String(next));
  };

  const inviteableFriends = friends.filter(
    (friend) => !groupMembers.some((member) => member.id === friend.id)
  );
  const canInviteMore = Boolean(groupSession && groupSession.owner_id === user?.id);

  return (
    <div className="group-session-page">
      {groupInvites.length > 0 && (
        <div className="group-invite-section">
          <p className="label">Pending invites</p>
          <div className="group-invite-list">
            {groupInvites.map((invite) => (
              <div key={invite.id} className="group-invite-card">
                <div>
                  <h3>{invite.session.task}</h3>
                  <p className="group-invite-card__from">
                    From {invite.inviter?.display_name || invite.inviter?.username || 'a study friend'}
                  </p>
                  <p>{Math.ceil(invite.session.duration_seconds / 60)} minutes</p>
                </div>
                <div className="group-invite-card__actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={inviteActionId === invite.id}
                    onClick={() => acceptGroupInvite(invite)}
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={inviteActionId === invite.id}
                    onClick={() => declineGroupInvite(invite)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {groupSession ? (
        <div className="group-session-active">
          <div className="group-session-card">
            <div>
              <p className="label">Current group session</p>
              <h3>{groupSession.task}</h3>
              <p>{Math.ceil(groupSession.duration_seconds / 60)} minutes</p>
              <p>{groupMembers.length} member{groupMembers.length === 1 ? '' : 's'} invited</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={leaveGroupSession}>
              Leave group session
            </button>
          </div>

          {canInviteMore && (
            <div className="group-invite-section">
              <p className="label">Invite more friends</p>
              {inviteableFriends.length === 0 ? (
                <p>Everyone in your friends list has already been invited.</p>
              ) : (
                <div className="invite-list">
                  {inviteableFriends.map((friend) => {
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
                {groupLoading ? 'Sending invites…' : 'Send invites'}
              </button>
            </div>
          )}

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
            <label htmlFor="group-task">Group session topic</label>
            <input
              id="group-task"
              type="text"
              value={groupTask}
              onChange={(e) => setGroupTask(e.target.value)}
              placeholder="e.g., Study math"
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="group-timer">Session length (minutes)</label>
            <div className="number-stepper">
              <input
                id="group-timer"
                type="number"
                min="1"
                max="120"
                value={studyTimerInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setStudyTimerInput(v);
                  const n = parseInt(v, 10);
                  if (!Number.isNaN(n)) setStudyTimer(n);
                }}
                onBlur={commitStudyTimerInput}
                className="input-field input-field--number"
              />
              <div className="number-stepper__controls">
                <button
                  type="button"
                  className="number-stepper__button"
                  onClick={() => stepStudyTimer(1)}
                  aria-label="Increase group study timer"
                >
                  <svg viewBox="0 0 12 12" focusable="false">
                    <path d="M3 7.5 6 4.5l3 3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="number-stepper__button"
                  onClick={() => stepStudyTimer(-1)}
                  aria-label="Decrease group study timer"
                >
                  <svg viewBox="0 0 12 12" focusable="false">
                    <path d="M3 4.5 6 7.5l3-3" />
                  </svg>
                </button>
              </div>
            </div>
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
            {groupLoading ? 'Starting group session…' : 'Start and send invites'}
          </button>
        </div>
      )}
    </div>
  );
}
