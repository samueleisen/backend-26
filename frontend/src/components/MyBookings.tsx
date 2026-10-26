import React, { useEffect, useState } from 'react';
import { Booking, getMyBookingsApi, cancelBookingApi, User } from '../api/client';
import { Trash2, CheckCircle, Info } from 'lucide-react';


interface MyBookingsProps {
  user: User | null;
  onOpenAuth: () => void;
}

export const MyBookings: React.FC<MyBookingsProps> = ({ user, onOpenAuth }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchBookings = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getMyBookingsApi();
      setBookings(data);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  const handleCancel = async (id: string, name: string) => {
    try {
      await cancelBookingApi(id);
      setActionMessage(`Booking for ${name} was cancelled. The time slot is now immediately freed!`);
      fetchBookings();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking');
    }
  };

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Please sign in to view and manage your reservations.
        </p>
        <button onClick={onOpenAuth} className="btn btn-primary">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>My Reservations</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Bookings registered under <strong>{user.email}</strong>
          </p>
        </div>
      </div>

      {actionMessage && (
        <div className="alert alert-success">
          <CheckCircle size={18} />
          <span>{actionMessage}</span>
        </div>
      )}

      <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Info size={18} color="var(--accent-cyan)" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <strong>Architecture Note:</strong> When you cancel a booking, its status changes to <code style={{ fontFamily: 'var(--font-mono)' }}>CANCELLED</code>. Because the PostgreSQL GiST index is partial (<code style={{ fontFamily: 'var(--font-mono)' }}>WHERE status = 'CONFIRMED'</code>), the row is immediately evicted from the exclusion constraint, freeing the exact slot for new bookings without deleting historical audit logs.
        </span>
      </div>

      <div className="bookings-table-wrap">
        <table className="bookings-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Reserved Interval</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  {loading ? 'Fetching bookings...' : 'No reservations found for your account.'}
                </td>
              </tr>
            ) : (
              bookings.map((booking) => (
                <tr key={booking.id} id={`booking-row-${booking.id}`}>
                  <td>
                    <strong>{booking.resource_name}</strong>
                  </td>
                  <td>
                    <span className={`resource-type-tag ${booking.resource_type}`}>
                      {booking.resource_type}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {new Date(booking.start).toLocaleString()} &rarr; {new Date(booking.end).toLocaleString()}
                  </td>
                  <td>
                    <span className={`status-badge ${booking.status.toLowerCase()}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {booking.status === 'CONFIRMED' && (
                      <button
                        id={`cancel-booking-${booking.id}`}
                        onClick={() => handleCancel(booking.id, booking.resource_name)}
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        <Trash2 size={13} />
                        <span>Cancel</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
