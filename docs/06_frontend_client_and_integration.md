# Phase 06: Frontend Client & Full-Stack Integration

This document defines the minimal, high-utility React client. Per [`star-domainscope.md`](./star-domainscope.md), it avoids calendar bloat and focuses strictly on **Resource Listing**, **Availability Checking**, **Booking Creation (with 409 Conflict handling)**, and **"My Bookings" with Cancellation**.


---

## 1. Client Architecture

The frontend is a lightweight Single Page Application (SPA) built with React and TypeScript:

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── api/
│   │   └── client.ts            # Axios / Fetch wrapper with JWT interceptor
│   ├── components/
│   │   ├── AuthModal.tsx        # Login & Register modal
│   │   ├── ResourceList.tsx     # Filterable list of rooms and equipment
│   │   ├── AvailabilityView.tsx # Displays booked intervals for selected resource
│   │   ├── BookingForm.tsx      # Date/time picker and submit handler
│   │   └── MyBookings.tsx       # Table of user's active bookings with cancel action
│   ├── App.tsx                  # Main layout and tab state
│   ├── main.tsx
│   └── styles.css               # Clean, accessible modern CSS
```

---

## 2. API Client with JWT State (`frontend/src/api/client.ts`)

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.message || 'API request failed');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  return data as T;
}
```

---

## 3. Core Component: Booking Form with 409 Conflict Handling

```tsx
import React, { useState } from 'react';
import { apiRequest } from '../api/client';

interface BookingFormProps {
  resourceId: string;
  resourceName: string;
  onBookingSuccess: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  resourceId,
  resourceName,
  onBookingSuccess,
}) => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    try {
      await apiRequest('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: resourceId,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        }),
      });

      setStatusMessage({
        type: 'success',
        text: `Confirmed booking for ${resourceName}!`,
      });
      setStart('');
      setEnd('');
      onBookingSuccess();
    } catch (err: any) {
      if (err.status === 409) {
        setStatusMessage({
          type: 'error',
          text: 'Conflict: This exact time slot was just taken. Please choose another time.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Failed to create booking.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="booking-form">
      <h3>Book {resourceName}</h3>

      {statusMessage && (
        <div className={`alert alert-${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div className="form-group">
        <label>Start Time:</label>
        <input
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>End Time:</label>
        <input
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Submitting...' : 'Confirm Reservation'}
      </button>
    </form>
  );
};
```

---

## 4. Availability Viewer Component

Displays already booked intervals retrieved from `GET /api/resources/:id/availability?from=&to=`:

```tsx
import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

interface BookedRange {
  id: string;
  start: string;
  end: string;
}

export const AvailabilityView: React.FC<{ resourceId: string }> = ({ resourceId }) => {
  const [bookedRanges, setBookedRanges] = useState<BookedRange[]>([]);

  const fetchAvailability = async () => {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    try {
      const res: any = await apiRequest(
        `/api/resources/${resourceId}/availability?from=${now.toISOString()}&to=${nextWeek.toISOString()}`
      );
      setBookedRanges(res.booked_ranges);
    } catch (err) {
      console.error('Failed to fetch availability:', err);
    }
  };

  useEffect(() => {
    if (resourceId) fetchAvailability();
  }, [resourceId]);

  return (
    <div className="availability-card">
      <h4>Occupied Intervals (Next 7 Days)</h4>
      {bookedRanges.length === 0 ? (
        <p className="text-muted">No bookings found for this window. Fully available!</p>
      ) : (
        <ul className="time-list">
          {bookedRanges.map((range) => (
            <li key={range.id} className="badge-busy">
              {new Date(range.start).toLocaleString()} - {new Date(range.end).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```
