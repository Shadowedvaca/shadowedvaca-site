export default function StatusBadge({ status }) {
  const classes = {
    open: 'badge-open',
    closed: 'badge-closed',
    archived: 'badge-archived',
  };
  return (
    <span className={classes[status] || 'badge bg-cream-200 text-navy-800'}>
      {status}
    </span>
  );
}
