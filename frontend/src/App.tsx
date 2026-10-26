import React, { useEffect, useState } from 'react';
import {
  User,
  Resource,
  getMeApi,
  getResourcesApi,
  loginApi,
  getToken,
} from './api/client';
import { DevOpsBar } from './components/DevOpsBar';
import { Navbar } from './components/Navbar';
import { ResourceList } from './components/ResourceList';
import { BookingModal } from './components/BookingModal';
import { AuthModal } from './components/AuthModal';
import { AdminModal } from './components/AdminModal';
import { MyBookings } from './components/MyBookings';
import { Cpu } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [activeTab, setActiveTab] = useState<'resources' | 'bookings'>('resources');

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const fetchUser = async () => {
    const currentUser = await getMeApi();
    setUser(currentUser);
  };

  const fetchResources = async () => {
    setLoadingResources(true);
    try {
      const data = await getResourcesApi();
      setResources(data);
    } catch (err) {
      console.error('Failed to load resources:', err);
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    // If no token exists on first load, auto-login as demo Alice for zero-friction evaluation
    const initAuth = async () => {
      if (!getToken()) {
        try {
          await loginApi('alice@example.com', 'password123');
        } catch {
          // Ignore if db empty
        }
      }
      fetchUser();
    };

    initAuth();
    fetchResources();

    window.addEventListener('auth-change', fetchUser);
    return () => window.removeEventListener('auth-change', fetchUser);
  }, []);

  return (
    <div>
      {/* DevOps Live Contract Probe Bar */}
      <DevOpsBar />

      {/* Navigation & User Profile */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenCreateResource={() => setAdminModalOpen(true)}
      />

      <main className="container">
        {/* Architecture Hero Banner */}
        <section className="hero">
          <div className="hero-tag">
            <Cpu size={14} />
            <span>PostgreSQL 16 &bull; GiST Concurrency Engine</span>
          </div>

          <h1 className="hero-title">High-Concurrency Resource Booking</h1>
          <p className="hero-subtitle">
            Zero double-booking race conditions enforced by database-level{' '}
            <strong style={{ color: 'var(--accent-cyan)' }}>
              GiST range exclusion constraints (<code style={{ fontFamily: 'var(--font-mono)' }}>tstzrange &&</code>)
            </strong>
            . Monitored with Prometheus telemetry and Gatus uptime probes.
          </p>
        </section>

        {/* Tab Content */}
        {activeTab === 'resources' ? (
          <ResourceList
            resources={resources}
            loading={loadingResources}
            onSelectResource={(res) => setSelectedResource(res)}
          />
        ) : (
          <MyBookings user={user} onOpenAuth={() => setAuthModalOpen(true)} />
        )}
      </main>

      {/* Modals */}
      <BookingModal
        resource={selectedResource}
        onClose={() => setSelectedResource(null)}
        onBookingSuccess={() => {
          fetchResources();
          setActiveTab('bookings');
        }}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <AdminModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onResourceCreated={fetchResources}
      />
    </div>
  );
};
