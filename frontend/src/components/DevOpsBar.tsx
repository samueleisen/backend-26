import React, { useEffect, useState } from 'react';
import { getHealthApi } from '../api/client';
import { Activity, ExternalLink, Database } from 'lucide-react';

export const DevOpsBar: React.FC = () => {
  const [health, setHealth] = useState<{ status: string; database: string; latency_ms: number } | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await getHealthApi();
        setHealth(data);
      } catch {
        setHealth(null);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000); // 15s poll matching Prometheus scrape interval
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="devops-bar">
      <div className="container devops-bar-inner">
        <div className="devops-status">
          <span className="pulse-dot" style={{ backgroundColor: health?.status === 'ok' ? '#10b981' : '#f43f5e' }}></span>
          <span>
            <strong>Gatus Probe:</strong>{' '}
            {health?.status === 'ok' ? (
              <>Health OK &bull; DB Connected ({health.latency_ms}ms)</>
            ) : (
              <>Degraded / Unreachable</>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            <Database size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            PostgreSQL 16 &bull; GiST Overlap Lock
          </span>
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className="devops-link"
            id="metrics-endpoint-link"
          >
            <Activity size={13} />
            <span>/metrics (Prometheus)</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};
