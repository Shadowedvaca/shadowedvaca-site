import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';

function Section({ title, children }) {
  return (
    <section className="card space-y-4">
      <h2 className="font-serif text-xl text-navy-900 border-b border-cream-200 pb-2">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();

  const [invites, setInvites] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [newInvite, setNewInvite] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [roundForm, setRoundForm] = useState({ title: '', voting_method: 'approval', deadline: '' });
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState('');

  const [closeRoundId, setCloseRoundId] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState('');

  const [notifForm, setNotifForm] = useState({ subject: '', body: '' });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState('');

  const [meetings, setMeetings] = useState([]);
  const [confirmLoading, setConfirmLoading] = useState('');

  const loadAll = async () => {
    try {
      const [inviteData, roundData, memberData] = await Promise.all([
        api.listInvites(),
        api.listRounds(),
        api.listMembers(),
      ]);
      setInvites(inviteData.invites);
      setRounds(roundData.rounds);
      setMembers(memberData.members);

      // Load meetings for all open rounds
      const openRounds = roundData.rounds.filter(r => r.status === 'open');
      const allMeetings = [];
      for (const r of openRounds) {
        try {
          const m = await api.listMeetings(r.id);
          allMeetings.push(...m.meetings.map(meeting => ({ ...meeting, round_title: r.title })));
        } catch { /* ignore */ }
      }
      setMeetings(allMeetings.filter(m => m.status !== 'confirmed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleGenerateInvite = async () => {
    setInviteLoading(true);
    setNewInvite(null);
    try {
      const data = await api.createInvite();
      setNewInvite(data.code);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateRound = async (e) => {
    e.preventDefault();
    setRoundError('');
    setRoundLoading(true);
    try {
      await api.createRound({
        ...roundForm,
        deadline: roundForm.deadline || null,
      });
      setRoundForm({ title: '', voting_method: 'approval', deadline: '' });
      await loadAll();
    } catch (err) {
      setRoundError(err.message);
    } finally {
      setRoundLoading(false);
    }
  };

  const handleCloseRound = async () => {
    if (!closeRoundId) return;
    if (!confirm('Close this round and calculate the winner?')) return;
    setCloseLoading(true);
    setCloseError('');
    try {
      await api.closeRound(closeRoundId);
      setCloseRoundId('');
      await loadAll();
    } catch (err) {
      setCloseError(err.message);
    } finally {
      setCloseLoading(false);
    }
  };

  const handleConfirmMeeting = async (meetingId) => {
    if (!confirm('Confirm this meeting time?')) return;
    setConfirmLoading(meetingId);
    try {
      await api.confirmMeeting(meetingId);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setConfirmLoading('');
    }
  };

  const handleSendNotification = async (e) => {
    e.preventDefault();
    setNotifLoading(true);
    setNotifSuccess('');
    try {
      const data = await api.sendNotification(notifForm);
      setNotifSuccess(data.message);
      setNotifForm({ subject: '', body: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setNotifLoading(false);
    }
  };

  const openRounds = rounds.filter(r => r.status === 'open');

  if (loading) return <LoadingSpinner className="mt-16" />;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-navy-900">Admin Panel</h1>
      <ErrorMessage message={error} />

      {/* Invite Codes */}
      <Section title="Invite Codes">
        <button
          onClick={handleGenerateInvite}
          disabled={inviteLoading}
          className="btn-primary disabled:opacity-60"
        >
          {inviteLoading ? 'Generating...' : 'Generate New Code'}
        </button>

        {newInvite && (
          <div className="flex items-center gap-3 p-3 bg-cream-100 rounded-lg">
            <code className="font-mono text-lg font-bold text-terracotta-600 tracking-widest">{newInvite}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newInvite)}
              className="text-xs btn-secondary py-1 px-2"
            >
              Copy
            </button>
          </div>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between text-sm p-2 bg-cream-50 rounded">
              <code className="font-mono font-bold tracking-wide">{inv.code}</code>
              <span className={`text-xs ${inv.used_by_name ? 'text-navy-800 opacity-50' : 'text-sage-500 font-medium'}`}>
                {inv.used_by_name ? `Used by ${inv.used_by_name}` : 'Available'}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Create Round */}
      <Section title="Create Voting Round">
        <form onSubmit={handleCreateRound} className="space-y-3">
          <div>
            <label className="label">Round Title</label>
            <input
              className="input"
              value={roundForm.title}
              onChange={e => setRoundForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. March 2026 Pick"
              required
            />
          </div>
          <div>
            <label className="label">Voting Method</label>
            <select
              className="input"
              value={roundForm.voting_method}
              onChange={e => setRoundForm(f => ({ ...f, voting_method: e.target.value }))}
            >
              <option value="approval">Approval (thumbs up per book)</option>
              <option value="ranked_choice">Ranked Choice (rank top 3)</option>
            </select>
          </div>
          <div>
            <label className="label">Deadline (optional)</label>
            <input
              className="input"
              type="datetime-local"
              value={roundForm.deadline}
              onChange={e => setRoundForm(f => ({ ...f, deadline: e.target.value }))}
            />
          </div>
          <ErrorMessage message={roundError} />
          <button type="submit" disabled={roundLoading} className="btn-primary disabled:opacity-60">
            {roundLoading ? 'Creating...' : 'Create Round'}
          </button>
        </form>
      </Section>

      {/* Close Round */}
      {openRounds.length > 0 && (
        <Section title="Close a Round">
          <p className="text-sm text-navy-800 opacity-60">Closing tallies votes and sets the winner. This cannot be undone.</p>
          <div className="flex gap-3">
            <select
              className="input"
              value={closeRoundId}
              onChange={e => setCloseRoundId(e.target.value)}
            >
              <option value="">Select a round...</option>
              {openRounds.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <button
              onClick={handleCloseRound}
              disabled={!closeRoundId || closeLoading}
              className="btn-primary whitespace-nowrap disabled:opacity-60"
            >
              {closeLoading ? 'Closing...' : 'Close Round'}
            </button>
          </div>
          <ErrorMessage message={closeError} />
        </Section>
      )}

      {/* Confirm Meetings */}
      {meetings.length > 0 && (
        <Section title="Confirm Meeting Times">
          <div className="space-y-3">
            {meetings.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-cream-50 rounded-lg">
                <div>
                  <p className="text-xs text-navy-800 opacity-50">{m.round_title}</p>
                  <p className="font-medium text-navy-900 text-sm">
                    {new Date(m.proposed_datetime).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                  {m.location && <p className="text-xs text-navy-800 opacity-60">{m.location}</p>}
                  <p className="text-xs text-navy-800 opacity-50 mt-1">
                    Yes: {m.yes_count} · Maybe: {m.maybe_count} · No: {m.no_count}
                  </p>
                </div>
                <button
                  onClick={() => handleConfirmMeeting(m.id)}
                  disabled={confirmLoading === m.id}
                  className="btn-secondary text-sm disabled:opacity-60"
                >
                  {confirmLoading === m.id ? '...' : 'Confirm'}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Send Notification */}
      <Section title="Send Announcement">
        <form onSubmit={handleSendNotification} className="space-y-3">
          <div>
            <label className="label">Subject (optional)</label>
            <input
              className="input"
              value={notifForm.subject}
              onChange={e => setNotifForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Meeting reminder, etc."
            />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea
              className="input"
              rows={3}
              value={notifForm.body}
              onChange={e => setNotifForm(f => ({ ...f, body: e.target.value }))}
              required
              placeholder="Your message to all members..."
            />
          </div>
          {notifSuccess && <p className="text-sm text-sage-500">{notifSuccess}</p>}
          <button type="submit" disabled={notifLoading} className="btn-primary disabled:opacity-60">
            {notifLoading ? 'Sending...' : `Send to All (${members.length} members)`}
          </button>
        </form>
      </Section>

      {/* Members */}
      <Section title="Members">
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-2 bg-cream-50 rounded">
              <div>
                <p className="font-medium text-navy-900 text-sm">{m.display_name}</p>
                <p className="text-xs text-navy-800 opacity-50">{m.email}</p>
              </div>
              <span className={`text-xs font-medium ${m.role === 'admin' ? 'text-terracotta-500' : 'text-navy-800 opacity-50'}`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
