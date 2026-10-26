import React, { useState } from 'react';
import { createResourceApi } from '../api/client';
import { X, ShieldCheck } from 'lucide-react';



interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResourceCreated: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  onResourceCreated,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'room' | 'equipment'>('room');
  const [capacity, setCapacity] = useState<number | ''>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createResourceApi({
        name,
        type,
        capacity: type === 'room' && capacity !== '' ? Number(capacity) : null,
      });
      setName('');
      onResourceCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create resource');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="var(--accent-amber)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Admin: Add New Resource</h2>
          </div>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        {error && <div className="alert alert-conflict">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Resource Name</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Innovation Lab 401"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-input"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              <option value="room">Room (Conference / Studio)</option>
              <option value="equipment">Equipment (Projector / Hardware)</option>
            </select>
          </div>

          {type === 'room' && (
            <div className="form-group">
              <label className="form-label">Capacity (People)</label>
              <input
                type="number"
                min={1}
                className="form-input"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
