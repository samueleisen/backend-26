const BASE_URL = ''; // Proxied via Vite in dev

export interface User {
  id: string;
  email: string;
  role: 'customer' | 'admin';
}

export interface Resource {
  id: string;
  name: string;
  type: 'room' | 'equipment';
  capacity: number | null;
  active: boolean;
  created_at: string;
}

export interface BookedRange {
  id: string;
  start: string;
  end: string;
}

export interface Booking {
  id: string;
  user_id: string;
  resource_id: string;
  resource_name: string;
  resource_type: 'room' | 'equipment';
  start: string;
  end: string;
  status: 'CONFIRMED' | 'CANCELLED';
  created_at: string;
}

export interface ApiError extends Error {
  status: number;
  code?: string;
  issues?: any[];
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
  window.dispatchEvent(new Event('auth-change'));
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
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
    const error = new Error(data.message || 'API request failed') as ApiError;
    error.status = response.status;
    error.code = data.code;
    error.issues = data.issues;
    throw error;
  }

  return data as T;
}

// Auth API
export async function loginApi(email: string, password: string): Promise<{ token: string; user: User }> {
  const data = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function registerApi(email: string, password: string, role: string = 'customer'): Promise<{ token: string; user: User }> {
  const data = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
  setToken(data.token);
  return data;
}

export async function getMeApi(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    const data = await apiRequest<{ user: User }>('/api/auth/me');
    return data.user;
  } catch {
    setToken(null);
    return null;
  }
}

// Resources API
export async function getResourcesApi(): Promise<Resource[]> {
  const data = await apiRequest<{ resources: Resource[] }>('/api/resources');
  return data.resources;
}

export async function createResourceApi(payload: { name: string; type: string; capacity?: number | null }): Promise<Resource> {
  const data = await apiRequest<{ resource: Resource }>('/api/resources', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.resource;
}

export async function getAvailabilityApi(resourceId: string, from: string, to: string): Promise<BookedRange[]> {
  const data = await apiRequest<{ booked_ranges: BookedRange[] }>(
    `/api/resources/${resourceId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  return data.booked_ranges;
}

// Bookings API (Star Endpoint)
export async function createBookingApi(resource_id: string, start: string, end: string): Promise<any> {
  return await apiRequest('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({ resource_id, start, end }),
  });
}

export async function getMyBookingsApi(): Promise<Booking[]> {
  const data = await apiRequest<{ bookings: Booking[] }>('/api/bookings');
  return data.bookings;
}

export async function cancelBookingApi(id: string): Promise<any> {
  return await apiRequest(`/api/bookings/${id}`, {
    method: 'DELETE',
  });
}

// Health Check API
export async function getHealthApi(): Promise<{ status: string; database: string; latency_ms: number }> {
  return await apiRequest('/health');
}
