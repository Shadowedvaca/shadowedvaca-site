import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BookCard from '../components/BookCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

function formatDate(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function DeadlineCountdown({ deadline }) {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  if (diff <= 0) return <span className="text-sm text-red-500">Voting deadline passed</span>;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return (
    <span className="text-sm text-navy-800 opacity-70">
      Voting closes in {days > 0 ? `${days}d ` : ''}{hours}h
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [rounds, setRounds] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proposalForm, setProposalForm] = useState({ title: '', author: '', description: '', cover_url: '' });
  const [proposalError, setProposalError] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.listRounds();
      setRounds(data.rounds);

      // Find upcoming confirmed meeting across all rounds
      const openRound = data.rounds.find(r => r.status === 'open');
      if (openRound) {
        try {
          const mData = await api.listMeetings(openRound.id);
          setMeetings(mData.meetings.filter(m => m.status === 'confirmed'));
        } catch {
          // silently ignore
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll every 30 seconds
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, []);

  const openRound = rounds.find(r => r.status === 'open');
  const lastClosedRound = rounds.find(r => r.status === 'closed');
  const upcomingMeeting = meetings[0];

  const handlePropose = async (e) => {
    e.preventDefault();
    if (!openRound) return;
    setProposalError('');
    setProposalLoading(true);
    try {
      await api.createProposal(openRound.id, proposalForm);
      setProposalForm({ title: '', author: '', description: '', cover_url: '' });
      setShowProposalForm(false);
      await loadData();
    } catch (err) {
      setProposalError(err.message);
    } finally {
      setProposalLoading(false);
    }
  };

  if (loading) return <LoadingSpinner className="mt-16" />;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-serif text-3xl text-navy-900">
          Welcome back, {user.display_name}
        </h1>
        <p className="text-navy-800 opacity-60 mt-1">Here's what's happening in the club.</p>
      </div>

      <ErrorMessage message={error} />

      {/* Upcoming Meeting */}
      {upcomingMeeting && (
        <div className="card bg-sage-400 text-white border-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Confirmed Meeting</p>
          <p className="font-serif text-xl mt-1">{formatDate(upcomingMeeting.proposed_datetime)}</p>
          {upcomingMeeting.location && <p className="text-sm mt-1 opacity-90">{upcomingMeeting.location}</p>}
          {upcomingMeeting.virtual_link && (
            <a href={upcomingMeeting.virtual_link} className="text-sm underline mt-1 block opacity-90" target="_blank" rel="noreferrer">
              Join online
            </a>
          )}
        </div>
      )}

      {/* Open Round */}
      {openRound ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-serif text-xl text-navy-900">{openRound.title}</h2>
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status="open" />
                <DeadlineCountdown deadline={openRound.deadline} />
              </div>
            </div>
            <Link to={`/rounds/${openRound.id}`} className="btn-primary text-sm">
              Vote Now
            </Link>
          </div>

          <p className="text-sm text-navy-800 opacity-70 mb-4">
            {openRound.proposal_count} {openRound.proposal_count === 1 ? 'book' : 'books'} proposed
            {openRound.voting_method === 'ranked_choice' ? ' · Ranked choice voting' : ' · Approval voting'}
          </p>

          {/* Quick propose */}
          {!showProposalForm ? (
            <button
              onClick={() => setShowProposalForm(true)}
              className="btn-secondary text-sm"
            >
              + Propose a Book
            </button>
          ) : (
            <div className="card mt-4 border-terracotta-400 border">
              <h3 className="font-serif text-navy-900 mb-3">Propose a Book</h3>
              <form onSubmit={handlePropose} className="space-y-3">
                <div>
                  <label className="label">Title *</label>
                  <input className="input" value={proposalForm.title} onChange={e => setProposalForm(f => ({ ...f, title: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Author</label>
                  <input className="input" value={proposalForm.author} onChange={e => setProposalForm(f => ({ ...f, author: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input" rows={3} value={proposalForm.description} onChange={e => setProposalForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Cover URL (optional)</label>
                  <input className="input" type="url" value={proposalForm.cover_url} onChange={e => setProposalForm(f => ({ ...f, cover_url: e.target.value }))} placeholder="https://..." />
                </div>
                <ErrorMessage message={proposalError} />
                <div className="flex gap-2">
                  <button type="submit" disabled={proposalLoading} className="btn-primary text-sm disabled:opacity-60">
                    {proposalLoading ? 'Submitting...' : 'Submit Proposal'}
                  </button>
                  <button type="button" onClick={() => setShowProposalForm(false)} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      ) : (
        <div className="card text-center py-8">
          <p className="font-serif text-navy-800 text-lg">No active voting round right now.</p>
          <p className="text-sm text-navy-800 opacity-60 mt-1">Check back soon, or ask your admin to start one.</p>
        </div>
      )}

      {/* Last Closed Round */}
      {lastClosedRound && (
        <section>
          <h2 className="font-serif text-xl text-navy-900 mb-3">Last Read</h2>
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-navy-800 opacity-60 uppercase tracking-wide mb-1">{lastClosedRound.title}</p>
                <p className="font-serif text-navy-900 text-lg font-semibold">{lastClosedRound.winning_title || 'No winner set'}</p>
                {lastClosedRound.winning_author && (
                  <p className="text-sm text-navy-800">by {lastClosedRound.winning_author}</p>
                )}
              </div>
              <Link to={`/rounds/${lastClosedRound.id}`} className="btn-ghost text-sm">
                View &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section>
        <h2 className="font-serif text-xl text-navy-900 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/rounds" className="btn-secondary text-sm">View Past Rounds</Link>
          <Link to="/profile" className="btn-secondary text-sm">Edit Profile</Link>
          {user.role === 'admin' && (
            <Link to="/admin" className="btn-secondary text-sm">Admin Panel</Link>
          )}
        </div>
      </section>
    </div>
  );
}
