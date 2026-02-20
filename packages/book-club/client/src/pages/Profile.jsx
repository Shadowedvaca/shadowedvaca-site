import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/ErrorMessage';

export default function Profile() {
  const { user, refreshUser } = useAuth();

  const [form, setForm] = useState({
    display_name: user.display_name || '',
    contact_channel: user.contact_channel || 'email',
    contact_address: user.contact_address || '',
    notification_prefs: user.notification_prefs || {
      vote_reminders: true,
      meeting_confirmations: true,
      new_proposals: true,
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handlePrefToggle = (key) => {
    setForm(f => ({
      ...f,
      notification_prefs: { ...f.notification_prefs, [key]: !f.notification_prefs[key] },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.updateMe(form);
      await refreshUser();
      setSuccess('Profile updated!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-serif text-3xl text-navy-900">Profile</h1>

      <div className="card">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-cream-200">
          <div className="w-12 h-12 rounded-full bg-terracotta-500 flex items-center justify-center text-white font-serif text-xl font-bold">
            {user.display_name[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-navy-900">{user.display_name}</p>
            <p className="text-sm text-navy-800 opacity-60">{user.email}</p>
            <p className="text-xs text-navy-800 opacity-40 capitalize">{user.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Display Name</label>
            <input
              className="input"
              name="display_name"
              value={form.display_name}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="label">Contact Channel</label>
            <select
              className="input"
              name="contact_channel"
              value={form.contact_channel}
              onChange={handleChange}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
            </select>
          </div>

          <div>
            <label className="label">Contact Address</label>
            <input
              className="input"
              name="contact_address"
              value={form.contact_address}
              onChange={handleChange}
              placeholder="phone number, @username, webhook URL..."
            />
          </div>

          <div>
            <label className="label mb-3 block">Notification Preferences</label>
            <div className="space-y-2">
              {Object.entries({
                vote_reminders: 'Vote reminders',
                meeting_confirmations: 'Meeting confirmations',
                new_proposals: 'New book proposals',
              }).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notification_prefs[key] || false}
                    onChange={() => handlePrefToggle(key)}
                    className="w-4 h-4 accent-terracotta-500"
                  />
                  <span className="text-sm text-navy-800">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <ErrorMessage message={error} />
          {success && <p className="text-sm text-sage-500">{success}</p>}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-serif text-lg text-navy-900 mb-3">Notifications</h2>
        <p className="text-sm text-navy-800 opacity-60">
          Notifications are logged to the system. Real dispatch (email, SMS) coming in a future update.
        </p>
      </div>
    </div>
  );
}
