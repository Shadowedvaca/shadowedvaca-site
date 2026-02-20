import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLink = (to, label) => {
    const active = location.pathname === to || location.pathname.startsWith(to + '/');
    return (
      <Link
        to={to}
        className={`text-sm font-medium transition-colors ${active ? 'text-terracotta-500' : 'text-navy-800 hover:text-terracotta-500'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="bg-white border-b border-cream-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-serif text-xl text-navy-900 font-bold tracking-tight">
            The Book Club
          </Link>

          {user && (
            <nav className="flex items-center gap-5">
              {navLink('/', 'Home')}
              {navLink('/rounds', 'Past Rounds')}
              {navLink('/profile', 'Profile')}
              {user.role === 'admin' && navLink('/admin', 'Admin')}
              <button
                onClick={handleLogout}
                className="text-sm text-navy-800 hover:text-terracotta-500 transition-colors"
              >
                Sign out
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
