import React, { useEffect, useState } from 'react';
import { Resource, BookedRange, getAvailabilityApi, createBookingApi } from '../api/client';
import { X, Clock, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';


interface BookingModalProps {
  resource: Resource | null;
  onClose: () => void;
  onBookingSuccess: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  resource,
  onClose,
  onBookingSuccess,
}) => {
  const [bookedRanges, setBookedRanges] = useState<BookedRange[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!resource) return;

    // Default start = tomorrow at 10:00 local, end = tomorrow at 11:00 local
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(11, 0, 0, 0);

    // Format for datetime-local: YYYY-MM-DDTHH:mm
    const toLocalISO = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setStart(toLocalISO(tomorrow));
    setEnd(toLocalISO(tomorrowEnd));

    // Fetch availability for the next 7 days
    const fetchAvailability = async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 7);

      try {
        const ranges = await getAvailabilityApi(resource.id, from.toISOString(), to.toISOString());
        setBookedRanges(ranges);
      } catch (err) {
        console.error('Failed to load availability:', err);
      }
    };

    fetchAvailability();
  }, [resource]);

  if (!resource) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);
    setGenericError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const startDate = new Date(start);
      const endDate = new Date(end);

      await createBookingApi(resource.id, startDate.toISOString(), endDate.toISOString());

      setSuccessMessage(`Reservation confirmed for ${resource.name}!`);
      setTimeout(() => {
        onBookingSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      if (err.status === 409 || err.code === 'EXCLUSION_VIOLATION') {
        setConflictError(
          '409 Conflict: Database Exclusion Lock Activated! This slot overlaps with an existing reservation. PostgreSQL GiST constraint prevented a double-booking.'
        );
      } else {
        setGenericError(err.message || 'Failed to complete reservation.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className={`resource-type-tag ${resource.type}`}>{resource.type}</span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '6px' }}>{resource.name}</h2>
          </div>
          <button onClick={onClose} className="close-btn" id="booking-modal-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* PROMINENT 409 CONFLICT BANNER */}
        {conflictError && (
          <div className="alert alert-conflict" id="conflict-error-banner">
            <ShieldAlert size={24} style={{ flexShrink: 0 }} />
            <div>
              <strong>CONCURRENCY RACE BLOCKED:</strong>
              <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>{conflictError}</div>
            </div>
          </div>
        )}

        {genericError && (
          <div className="alert alert-conflict">
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <span>{genericError}</span>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" id="booking-success-banner">
            <CheckCircle size={20} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Existing Booked Intervals */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Occupied Intervals (Next 7 Days):
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
              via PostgreSQL <code style={{ fontFamily: 'var(--font-mono)' }}>tstzrange &&</code>
            </span>
          </div>

          <div className="intervals-list">
            {bookedRanges.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '8px' }}>
                No active bookings in the next 7 days. Fully open!
              </div>
            ) : (
              bookedRanges.map((range) => (
                <div key={range.id} className="interval-item">
                  <span style={{ color: 'var(--accent-rose)' }}>&bull; OCCUPIED</span>
                  <span>{new Date(range.start).toLocaleString()} &rarr; {new Date(range.end).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reservation Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">
                <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Start Time
              </label>
              <input
                id="booking-start-input"
                type="datetime-local"
                required
                className="form-input"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                End Time
              </label>
              <input
                id="booking-end-input"
                type="datetime-local"
                required
                className="form-input"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              id="confirm-reservation-submit-btn"
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Submitting to DB...' : 'Confirm Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
