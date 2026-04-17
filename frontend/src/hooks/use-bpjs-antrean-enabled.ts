import { useEffect, useState } from 'react';

import { bpjsBridgeApi } from '@/lib/api';

const BPJS_STATUS_EVENT = 'bpjs-status-changed';

export function useBpjsAntreanEnabled() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await bpjsBridgeApi.getStatus();
        if (!cancelled) {
          setEnabled(Boolean(response.data.data.domains.antrean?.enabled));
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStatus();

    const handleRefresh = () => {
      setLoading(true);
      void loadStatus();
    };

    window.addEventListener(BPJS_STATUS_EVENT, handleRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(BPJS_STATUS_EVENT, handleRefresh);
    };
  }, []);

  return { bpjsAntreanEnabled: enabled, bpjsAntreanLoading: loading };
}