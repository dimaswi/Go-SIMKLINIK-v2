import { useCallback, useEffect, useState } from 'react';
import { medicalRecordsApi, visitsApi, type MedicalRecord, type Visit } from '@/lib/api';
import { sortMedicalRecords } from './utils';

export function useVisitEmr(visitId: number) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateVisit = useCallback((updater: (currentVisit: Visit | null) => Visit | null) => {
    setVisit((currentVisit) => updater(currentVisit));
  }, []);

  const replaceRecords = useCallback((updater: (currentRecords: MedicalRecord[]) => MedicalRecord[]) => {
    setRecords((currentRecords) => sortMedicalRecords(updater(currentRecords)));
  }, []);

  const upsertRecord = useCallback((nextRecord: MedicalRecord) => {
    replaceRecords((currentRecords) => [nextRecord, ...currentRecords.filter((record) => record.id !== nextRecord.id)]);
  }, [replaceRecords]);

  const patchRecord = useCallback((recordId: number, updater: (record: MedicalRecord) => MedicalRecord) => {
    replaceRecords((currentRecords) => currentRecords.map((record) => (record.id === recordId ? updater(record) : record)));
  }, [replaceRecords]);

  const reload = useCallback(async () => {
    if (!visitId) return;

    setLoading(true);
    setError(null);
    try {
      const [visitResponse, recordsResponse] = await Promise.all([
        visitsApi.getById(visitId),
        medicalRecordsApi.getByVisit(visitId),
      ]);

      setVisit(visitResponse.data.data);
      setRecords(sortMedicalRecords(recordsResponse.data.data || []));
    } catch (err: any) {
      setVisit(null);
      setRecords([]);
      setError(err?.response?.data?.error || 'Gagal memuat workspace rekam medis');
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    visit,
    records,
    loading,
    error,
    reload,
    updateVisit,
    replaceRecords,
    upsertRecord,
    patchRecord,
  };
}
