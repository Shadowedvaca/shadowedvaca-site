export default function BookCard({ proposal, isWinner, children, className = '' }) {
  return (
    <div className={`card relative ${isWinner ? 'border-terracotta-400 border-2' : ''} ${className}`}>
      {isWinner && (
        <div className="absolute -top-3 left-4">
          <span className="badge bg-terracotta-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
            Winner
          </span>
        </div>
      )}
      <div className="flex gap-4">
        {proposal.cover_url && (
          <img
            src={proposal.cover_url}
            alt={`Cover of ${proposal.title}`}
            className="w-16 h-24 object-cover rounded shadow-sm flex-shrink-0"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-navy-900 font-semibold text-lg leading-tight">
            {proposal.title}
          </h3>
          {proposal.author && (
            <p className="text-sm text-navy-800 mt-0.5">by {proposal.author}</p>
          )}
          {proposal.description && (
            <p className="text-sm text-navy-800 mt-2 line-clamp-3 opacity-80">
              {proposal.description}
            </p>
          )}
          <p className="text-xs text-navy-800 opacity-60 mt-2">
            Proposed by {proposal.proposed_by_name}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
