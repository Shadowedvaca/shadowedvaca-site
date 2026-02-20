import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/ErrorMessage';

export default function LoginRegister() {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({
    email: '', password: '', display_name: '', invite_code: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.password, form.display_name, form.invite_code);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl text-navy-900 font-bold">The Book Club</h1>
          <p className="text-navy-800 opacity-60 mt-2">Read together, better.</p>
        </div>

        <div className="card">
          {/* Tabs */}
          <div className="flex border-b border-cream-200 mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 pb-3 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-terracotta-500 text-terracotta-500'
                    : 'border-transparent text-navy-800 hover:text-terracotta-500'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Join the Club'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="label">Display Name</label>
                <input
                  className="input"
                  name="display_name"
                  value={form.display_name}
                  onChange={handleChange}
                  placeholder="How you'll appear to others"
                  required
                />
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input
                className="input"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder={tab === 'register' ? 'At least 8 characters' : ''}
                required
              />
            </div>

            {tab === 'register' && (
              <div>
                <label className="label">Invite Code</label>
                <input
                  className="input"
                  name="invite_code"
                  value={form.invite_code}
                  onChange={handleChange}
                  placeholder="Ask a member for your code"
                  required
                />
              </div>
            )}

            <ErrorMessage message={error} />

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-60"
            >
              {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
