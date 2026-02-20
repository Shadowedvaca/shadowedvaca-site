import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function PastRounds() {
  const { data, loading, error } = useApi(() => api.listRounds());

  if (loading) return <LoadingSpinner className="mt-16" />;
  if (error) return <ErrorMessage message={error} className="mt-8" />;

  const rounds = data?.rounds || [];
  const pastRounds = rounds.filter(r => r.status === 'closed' || r.status === 'archived');

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-navy-900">Past Rounds</h1>

      {pastRounds.length === 0 ? (
        <div className="card text-center py-10">
          <p className="font-serif text-navy-800 opacity-60">No completed rounds yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pastRounds.map(r => (
            <Link key={r.id} to={`/rounds/${r.id}`} className="block">
              <div className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-navy-800 opacity-50">
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <h2 className="font-serif text-xl text-navy-900">{r.title}</h2>
                    {r.winning_title ? (
                      <div className="mt-2">
                        <p className="text-xs text-navy-800 opacity-60 uppercase tracking-wide">Winner</p>
                        <p className="font-medium text-navy-900">{r.winning_title}</p>
                        {r.winning_author && <p className="text-sm text-navy-800 opacity-70">by {r.winning_author}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-navy-800 opacity-50 mt-2">No winner recorded</p>
                    )}
                    <p className="text-xs text-navy-800 opacity-50 mt-2">
                      {r.proposal_count} proposals
                    </p>
                  </div>
                  <span className="text-terracotta-500 text-sm">&rarr;</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Also show open rounds */}
      {rounds.filter(r => r.status === 'open').length > 0 && (
        <div>
          <h2 className="font-serif text-xl text-navy-900 mb-3">Active</h2>
          <div className="space-y-3">
            {rounds.filter(r => r.status === 'open').map(r => (
              <Link key={r.id} to={`/rounds/${r.id}`} className="block">
                <div className="card hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status="open" />
                      <h3 className="font-serif text-lg text-navy-900">{r.title}</h3>
                    </div>
                    <span className="text-terracotta-500 text-sm">&rarr;</span>
                  </div>
                  <p className="text-xs text-navy-800 opacity-50 mt-1">{r.proposal_count} proposals</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
