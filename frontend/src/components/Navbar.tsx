import React from 'react';
import { User, setToken, loginApi } from '../api/client';
import { Layers, Calendar, User as UserIcon, LogOut, PlusCircle } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  activeTab: 'resources' | 'bookings';
  setActiveTab: (tab: 'resources' | 'bookings') => void;
  onOpenAuth: () => void;
  onOpenCreateResource: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onOpenAuth,
  onOpenCreateResource,
}) => {
  const switchDemoAccount = async (email: string, pass: string) => {
    try {
      await loginApi(email, pass);
    } catch (err) {
      console.error('Failed to switch demo account:', err);
    }
  };

  const handleLogout = () => {
    setToken(null);
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <a href="#" className="brand" onClick={() => setActiveTab('resources')}>
          <div className="brand-icon">
            <Layers size={20} />
          </div>
          <span>ResourceFlow</span>
        </a>

        <nav className="nav-links">
          <button
            id="nav-resources-tab"
            className={`nav-btn ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
          >
            <Layers size={16} />
            <span>Explore Resources</span>
          </button>

          <button
            id="nav-bookings-tab"
            className={`nav-btn ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <Calendar size={16} />
            <span>My Bookings</span>
          </button>

          {user?.role === 'admin' && (
            <button
              id="admin-create-resource-btn"
              className="nav-btn"
              onClick={onOpenCreateResource}
              style={{ color: 'var(--accent-amber)' }}
            >
              <PlusCircle size={16} />
              <span>Add Resource</span>
            </button>
          )}
        </nav>

        <div className="auth-bar">
          {/* Quick Demo Switcher */}
          <div className="demo-switcher" title="Quickly switch between pre-seeded test accounts">
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', paddingLeft: '6px' }}>Switch:</span>
            <button
              className={`demo-btn ${user?.email === 'alice@example.com' ? 'active' : ''}`}
              onClick={() => switchDemoAccount('alice@example.com', 'password123')}
            >
              Alice
            </button>
            <button
              className={`demo-btn ${user?.email === 'bob@example.com' ? 'active' : ''}`}
              onClick={() => switchDemoAccount('bob@example.com', 'password123')}
            >
              Bob
            </button>
            <button
              className={`demo-btn ${user?.email === 'admin@example.com' ? 'active' : ''}`}
              onClick={() => switchDemoAccount('admin@example.com', 'adminpassword123')}
            >
              Admin
            </button>
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="user-badge">
                <UserIcon size={14} color="var(--text-secondary)" />
                <span>{user.email}</span>
                <span className={`user-role-pill ${user.role}`}>{user.role}</span>
              </div>
              <button
                id="logout-btn"
                onClick={handleLogout}
                className="btn btn-secondary"
                style={{ padding: '6px 12px' }}
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button id="login-modal-open-btn" onClick={onOpenAuth} className="btn btn-primary">
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
