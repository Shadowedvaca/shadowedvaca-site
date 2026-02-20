import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BookCard from '../components/BookCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

function formatDateTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function AvailabilityButton({ response, label, meetingId, myResponse, onSubmit }) {
  const isActive = myResponse === response;
  const colors = {
    yes: isActive ? 'bg-sage-500 text-white border-sage-500' : 'border-cream-300 text-navy-800 hover:border-sage-400',
    maybe: isActive ? 'bg-yellow-500 text-white border-yellow-500' : 'border-cream-300 text-navy-800 hover:border-yellow-400',
    no: isActive ? 'bg-red-400 text-white border-red-400' : 'border-cream-300 text-navy-800 hover:border-red-300',
  };
  return (
    <button
      onClick={() => onSubmit(meetingId, response)}
      className={`px-3 py-1 rounded-lg border text-sm font-medium transition-colors ${colors[response]}`}
    >
      {label}
    </button>
  );
}

function VotingPanel({ round, proposals, myVotes, onVotesSubmitted }) {
  const [ranked, setRanked] = useState({});
  const [approved, setApproved] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (round.voting_method === 'ranked_choice') {
      const r = {};
      myVotes.forEach(v => { r[v.proposal_id] = v.rank; });
      setRanked(r);
    } else {
      setApproved(new Set(myVotes.map(v => v.proposal_id)));
    }
  }, [myVotes, round.voting_method]);

  const handleRankChange = (proposalId, rank) => {
    setRanked(prev => {
      const next = { ...prev };
      // Remove any existing assignment of this rank
      Object.keys(next).forEach(k => { if (next[k] === rank) delete next[k]; });
      if (rank === 0) {
        delete next[proposalId];
      } else {
        next[proposalId] = rank;
      }
      return next;
    });
  };

  const handleApprovalToggle = (proposalId) => {
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(proposalId)) next.delete(proposalId);
      else next.add(proposalId);
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      let votes;
      if (round.voting_method === 'ranked_choice') {
        votes = Object.entries(ranked).map(([proposal_id, rank]) => ({ proposal_id, rank }));
      } else {
        votes = Array.from(approved).map(proposal_id => ({ proposal_id }));
      }
      await api.submitVotes(round.id, { votes });
      setSuccess('Votes saved!');
      setTimeout(() => setSuccess(''), 3000);
      onVotesSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (round.status !== 'open') return null;

  return (
    <div className="card border-terracotta-400 border">
      <h3 className="font-serif text-navy-900 text-lg mb-1">Cast Your Vote</h3>
      <p className="text-sm text-navy-800 opacity-60 mb-4">
        {round.voting_method === 'ranked_choice'
          ? 'Rank up to 3 books (1st = most preferred)'
          : 'Approve as many books as you like'}
      </p>

      <div className="space-y-3">
        {proposals.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 bg-cream-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-navy-900 text-sm">{p.title}</p>
              {p.author && <p className="text-xs text-navy-800 opacity-60">{p.author}</p>}
            </div>
            {round.voting_method === 'ranked_choice' ? (
              <select
                value={ranked[p.id] || 0}
                onChange={e => handleRankChange(p.id, parseInt(e.target.value))}
                className="input w-24 text-sm"
              >
                <option value={0}>—</option>
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
              </select>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approved.has(p.id)}
                  onChange={() => handleApprovalToggle(p.id)}
                  className="w-4 h-4 accent-terracotta-500"
                />
                <span className="text-sm text-navy-800">Approve</span>
              </label>
            )}
          </div>
        ))}
      </div>

      <ErrorMessage message={error} className="mt-3" />
      {success && <p className="text-sm text-sage-500 mt-3">{success}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-primary mt-4 disabled:opacity-60"
      >
        {submitting ? 'Saving...' : 'Submit Votes'}
      </button>
    </div>
  );
}

export default function RoundDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [round, setRound] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [myVotes, setMyVotes] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [proposalForm, setProposalForm] = useState({ title: '', author: '', description: '', cover_url: '' });
  const [proposalError, setProposalError] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);

  const [meetingForm, setMeetingForm] = useState({ proposed_datetime: '', location: '', virtual_link: '', notes: '' });
  const [meetingError, setMeetingError] = useState('');
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);

  const loadAll = async () => {
    try {
      const [roundData, voteData, meetingData] = await Promise.all([
        api.getRound(id),
        api.getMyVotes(id),
        api.listMeetings(id),
      ]);
      setRound(roundData.round);
      setProposals(roundData.proposals);
      setMyVotes(voteData.votes);
      setMeetings(meetingData.meetings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const id2 = setInterval(loadAll, 30000);
    return () => clearInterval(id2);
  }, [id]);

  const handlePropose = async (e) => {
    e.preventDefault();
    setProposalError('');
    setProposalLoading(true);
    try {
      await api.createProposal(id, proposalForm);
      setProposalForm({ title: '', author: '', description: '', cover_url: '' });
      setShowProposalForm(false);
      await loadAll();
    } catch (err) {
      setProposalError(err.message);
    } finally {
      setProposalLoading(false);
    }
  };

  const handleDeleteProposal = async (proposalId) => {
    if (!confirm('Delete this proposal?')) return;
    try {
      await api.deleteProposal(proposalId);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setMeetingError('');
    setMeetingLoading(true);
    try {
      await api.createMeeting(id, meetingForm);
      setMeetingForm({ proposed_datetime: '', location: '', virtual_link: '', notes: '' });
      setShowMeetingForm(false);
      await loadAll();
    } catch (err) {
      setMeetingError(err.message);
    } finally {
      setMeetingLoading(false);
    }
  };

  const handleAvailability = async (meetingId, response) => {
    try {
      await api.submitAvailability(meetingId, { response });
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    if (!confirm('Delete this meeting proposal?')) return;
    try {
      await api.deleteMeeting(meetingId);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <LoadingSpinner className="mt-16" />;
  if (error) return <ErrorMessage message={error} className="mt-8" />;
  if (!round) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-navy-800 opacity-60 hover:opacity-100 mb-3 block">
          &larr; Back
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-navy-900">{round.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={round.status} />
              <span className="text-sm text-navy-800 opacity-60 capitalize">{round.voting_method.replace('_', ' ')} voting</span>
              {round.deadline && round.status === 'open' && (
                <span className="text-sm text-navy-800 opacity-60">
                  Deadline: {new Date(round.deadline).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voting UI for open rounds */}
      {round.status === 'open' && proposals.length > 0 && (
        <VotingPanel
          round={round}
          proposals={proposals}
          myVotes={myVotes}
          onVotesSubmitted={loadAll}
        />
      )}

      {/* Proposals */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl text-navy-900">Proposals ({proposals.length})</h2>
          {round.status === 'open' && !showProposalForm && (
            <button onClick={() => setShowProposalForm(true)} className="btn-secondary text-sm">
              + Propose Book
            </button>
          )}
        </div>

        {showProposalForm && (
          <div className="card mb-4 border-terracotta-400 border">
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
                <label className="label">Cover URL</label>
                <input className="input" type="url" value={proposalForm.cover_url} onChange={e => setProposalForm(f => ({ ...f, cover_url: e.target.value }))} placeholder="https://..." />
              </div>
              <ErrorMessage message={proposalError} />
              <div className="flex gap-2">
                <button type="submit" disabled={proposalLoading} className="btn-primary text-sm disabled:opacity-60">
                  {proposalLoading ? 'Submitting...' : 'Submit Proposal'}
                </button>
                <button type="button" onClick={() => setShowProposalForm(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {proposals.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-navy-800 opacity-60">No proposals yet. Be the first to suggest a book!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <BookCard
                key={p.id}
                proposal={p}
                isWinner={round.winning_proposal_id === p.id}
              >
                <div className="flex items-center gap-3 mt-3">
                  {round.status !== 'open' && (
                    <span className="text-sm font-semibold text-navy-800">
                      Score: {p.vote_score}
                    </span>
                  )}
                  {(user.role === 'admin' || p.proposed_by === user.id) && round.status === 'open' && (
                    <button
                      onClick={() => handleDeleteProposal(p.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </BookCard>
            ))}
          </div>
        )}
      </section>

      {/* Results section (after close) */}
      {round.status === 'closed' && proposals.length > 0 && (
        <section>
          <h2 className="font-serif text-xl text-navy-900 mb-4">Final Results</h2>
          <div className="space-y-2">
            {[...proposals].sort((a, b) => b.vote_score - a.vote_score).map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg ${p.id === round.winning_proposal_id ? 'bg-terracotta-500 text-white' : 'bg-cream-100'}`}>
                <span className="text-lg font-bold w-6">#{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium">{p.title}</p>
                  {p.author && <p className="text-xs opacity-75">{p.author}</p>}
                </div>
                <span className="font-bold">{p.vote_score} pts</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Meetings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl text-navy-900">Meeting Times</h2>
          {!showMeetingForm && (
            <button onClick={() => setShowMeetingForm(true)} className="btn-secondary text-sm">
              + Propose Time
            </button>
          )}
        </div>

        {showMeetingForm && (
          <div className="card mb-4 border-sage-400 border">
            <h3 className="font-serif text-navy-900 mb-3">Propose a Meeting Time</h3>
            <form onSubmit={handleCreateMeeting} className="space-y-3">
              <div>
                <label className="label">Date & Time *</label>
                <input className="input" type="datetime-local" value={meetingForm.proposed_datetime} onChange={e => setMeetingForm(f => ({ ...f, proposed_datetime: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Location</label>
                <input className="input" value={meetingForm.location} onChange={e => setMeetingForm(f => ({ ...f, location: e.target.value }))} placeholder="Coffee shop, address..." />
              </div>
              <div>
                <label className="label">Virtual Link</label>
                <input className="input" type="url" value={meetingForm.virtual_link} onChange={e => setMeetingForm(f => ({ ...f, virtual_link: e.target.value }))} placeholder="Zoom, Meet link..." />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <ErrorMessage message={meetingError} />
              <div className="flex gap-2">
                <button type="submit" disabled={meetingLoading} className="btn-primary text-sm disabled:opacity-60">
                  {meetingLoading ? 'Saving...' : 'Propose Time'}
                </button>
                <button type="button" onClick={() => setShowMeetingForm(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="card text-center py-6">
            <p className="text-navy-800 opacity-60 text-sm">No meeting times proposed yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map(m => (
              <div key={m.id} className={`card ${m.status === 'confirmed' ? 'border-sage-400 border-2' : ''}`}>
                {m.status === 'confirmed' && (
                  <span className="badge bg-sage-400 text-white mb-2">Confirmed</span>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-navy-900">{formatDateTime(m.proposed_datetime)}</p>
                    {m.location && <p className="text-sm text-navy-800 opacity-70 mt-0.5">{m.location}</p>}
                    {m.virtual_link && (
                      <a href={m.virtual_link} target="_blank" rel="noreferrer" className="text-sm text-terracotta-500 mt-0.5 block">
                        Join online
                      </a>
                    )}
                    {m.notes && <p className="text-sm text-navy-800 opacity-60 mt-1">{m.notes}</p>}
                    <p className="text-xs text-navy-800 opacity-50 mt-1">Proposed by {m.proposed_by_name}</p>
                    <div className="flex gap-3 mt-2 text-xs text-navy-800 opacity-60">
                      <span>Yes: {m.yes_count}</span>
                      <span>Maybe: {m.maybe_count}</span>
                      <span>No: {m.no_count}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <div className="flex gap-1">
                      <AvailabilityButton response="yes" label="Yes" meetingId={m.id} myResponse={m.my_response} onSubmit={handleAvailability} />
                      <AvailabilityButton response="maybe" label="Maybe" meetingId={m.id} myResponse={m.my_response} onSubmit={handleAvailability} />
                      <AvailabilityButton response="no" label="No" meetingId={m.id} myResponse={m.my_response} onSubmit={handleAvailability} />
                    </div>
                    {(user.role === 'admin' || m.proposed_by === user.id) && m.status !== 'confirmed' && (
                      <button onClick={() => handleDeleteMeeting(m.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
