import React, { useState } from 'react';
import { loginApi, registerApi } from '../api/client';
import { X, ShieldAlert } from 'lucide-react';


interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'admin'>('customer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await registerApi(email, password, role);
      } else {
        await loginApi(email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          <button onClick={onClose} className="close-btn" id="auth-modal-close-btn">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="alert alert-conflict">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                id="auth-email-input"
                type="email"
                required
                className="form-input"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="auth-password-input"
                type="password"
                required
                minLength={8}
                className="form-input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Account Role</label>
              <select
                id="auth-role-select"
                className="form-input"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="customer">Customer (Standard User)</option>
                <option value="admin">Admin (Manage Resources)</option>
              </select>
            </div>
          )}

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
          >
            {loading ? 'Please wait...' : isRegister ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {isRegister ? (
            <>
              Already have an account?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setIsRegister(false);
                }}
                style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
              >
                Sign In
              </a>
            </>
          ) : (
            <>
              Need an account?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setIsRegister(true);
                }}
                style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
              >
                Create one
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
