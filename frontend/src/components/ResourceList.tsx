import React, { useState } from 'react';
import { Resource } from '../api/client';
import { DoorClosed, Tv, Users, CalendarPlus } from 'lucide-react';

interface ResourceListProps {
  resources: Resource[];
  loading: boolean;
  onSelectResource: (resource: Resource) => void;
}

export const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  loading,
  onSelectResource,
}) => {
  const [filter, setFilter] = useState<'all' | 'room' | 'equipment'>('all');

  const filtered = resources.filter((r) => {
    if (filter === 'all') return true;
    return r.type === filter;
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
        Loading resources from PostgreSQL...
      </div>
    );
  }

  return (
    <div>
      <div className="controls-bar">
        <div className="filter-group">
          <button
            id="filter-all-btn"
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Resources ({resources.length})
          </button>
          <button
            id="filter-rooms-btn"
            className={`filter-btn ${filter === 'room' ? 'active' : ''}`}
            onClick={() => setFilter('room')}
          >
            Rooms ({resources.filter((r) => r.type === 'room').length})
          </button>
          <button
            id="filter-equipment-btn"
            className={`filter-btn ${filter === 'equipment' ? 'active' : ''}`}
            onClick={() => setFilter('equipment')}
          >
            Equipment ({resources.filter((r) => r.type === 'equipment').length})
          </button>
        </div>
      </div>

      <div className="resource-grid">
        {filtered.map((resource) => (
          <div key={resource.id} className="resource-card" id={`resource-card-${resource.id}`}>
            <div>
              <div className="resource-header">
                <div className="resource-icon-wrap">
                  {resource.type === 'room' ? <DoorClosed size={22} /> : <Tv size={22} />}
                </div>
                <span className={`resource-type-tag ${resource.type}`}>{resource.type}</span>
              </div>

              <h3 className="resource-name">{resource.name}</h3>

              <div className="resource-meta">
                {resource.capacity ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={14} />
                    <span>Capacity: {resource.capacity} people</span>
                  </span>
                ) : (
                  <span>Equipment Unit</span>
                )}
              </div>
            </div>

            <div className="resource-actions">
              <button
                id={`book-resource-${resource.id}`}
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => onSelectResource(resource)}
              >
                <CalendarPlus size={16} />
                <span>Book / Check Availability</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
