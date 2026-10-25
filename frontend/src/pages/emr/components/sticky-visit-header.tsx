import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { satusehatApi, type SatusehatVisitAutoSyncResult, type Visit } from '@/lib/api';
import { ArrowLeft, Eye, FileText, Loader2, RefreshCw, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CORE_COMPLETION_TOTAL } from '../constants';
import { formatDateTime } from '../utils';
import { SatusehatAutoSyncMonitorDialog } from './satusehat-auto-sync-monitor-dialog';
import { PatientDetailDialog } from './patient-detail-dialog';

type EncounterRequirement = {
  label: string;
  ready: boolean;
  value: string;
};

type StickyVisitHeaderProps = {
  visit: Visit;
  completedSections: number;
  isLocked: boolean;
  onBack: () => void;
  sticky?: boolean;
  sectionLabel?: string;
  allergyInfo?: string;
  statusNote?: ReactNode;
  actions?: ReactNode;
  onEncounterSynced?: () => Promise<void> | void;
  prefetchedMonitorResult?: SatusehatVisitAutoSyncResult | null;
  prefetchedMonitorMessage?: string;
};

function getMonitorStorageKey(visitId?: number) {
  return `satusehat-auto-sync-monitor:${visitId || 0}`;
}

function loadStoredMonitorSnapshot(visitId?: number): { result: SatusehatVisitAutoSyncResult | null; message: string } {
  if (!visitId) {
    return { result: null, message: '' };
  }

  try {
    const raw = localStorage.getItem(getMonitorStorageKey(visitId));
    if (!raw) {
      return { result: null, message: '' };
    }

    const parsed = JSON.parse(raw) as { result?: SatusehatVisitAutoSyncResult | null; message?: string };
    return {
      result: parsed?.result || null,
      message: (parsed?.message || '').trim(),
    };
  } catch {
    return { result: null, message: '' };
  }
}

function persistMonitorSnapshot(visitId: number | undefined, result: SatusehatVisitAutoSyncResult | null, message: string) {
  if (!visitId || !result) {
    return;
  }

  try {
    localStorage.setItem(getMonitorStorageKey(visitId), JSON.stringify({ result, message: (message || '').trim() }));
  } catch {
    // Ignore storage issues so monitor flow never breaks.
  }
}

function buildEncounterRequirements(visit: Visit): EncounterRequirement[] {
  return [
    {
      label: 'Patient',
      ready: Boolean(visit.patient?.satusehat_patient_id),
      value: visit.patient?.satusehat_patient_id || 'Belum ada SATUSEHAT Patient ID',
    },
    {
      label: 'Practitioner',
      ready: Boolean(visit.doctor?.satusehat_practitioner_id),
      value: visit.doctor?.satusehat_practitioner_id || 'Dokter belum punya SATUSEHAT Practitioner ID',
    },
    {
      label: 'Organization',
      ready: Boolean(visit.polyclinic?.satusehat_organization_id),
      value: visit.polyclinic?.satusehat_organization_id || 'Organization poli belum tersinkron',
    },
    {
      label: 'Location',
      ready: Boolean(visit.polyclinic?.satusehat_location_id),
      value: visit.polyclinic?.satusehat_location_id || 'Location poli belum tersinkron',
    },
  ];
}

export function StickyVisitHeader({
  visit,
  completedSections,
  isLocked,
  onBack,
  sticky = true,
  sectionLabel,
  allergyInfo,
  statusNote,
  actions,
  onEncounterSynced,
  prefetchedMonitorResult,
  prefetchedMonitorMessage,
}: StickyVisitHeaderProps) {
  const { toast } = useToast();
  const { hasAnyPermission } = usePermission();
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [runningAutoSync, setRunningAutoSync] = useState(false);
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [monitorAutoRefreshEnabled, setMonitorAutoRefreshEnabled] = useState(false);
  const [monitorResult, setMonitorResult] = useState<SatusehatVisitAutoSyncResult | null>(null);
  const [monitorMessage, setMonitorMessage] = useState('');

  const allergyLabel = (allergyInfo || visit.patient?.allergies || '').trim();
  const stickyOffsetStyle = sticky ? { top: 0 } : undefined;
  const encounterRequirements = buildEncounterRequirements(visit);
  const encounterReadyCount = encounterRequirements.filter((item) => item.ready).length;
  const encounterReady = encounterReadyCount === 4;
  const baselineReadyNodes = [
    visit.polyclinic?.satusehat_organization_id ? 'organization' : '',
    visit.polyclinic?.satusehat_location_id ? 'location' : '',
    visit.patient?.satusehat_patient_id ? 'patient' : '',
    visit.doctor?.satusehat_practitioner_id ? 'practitioner' : '',
    visit.satusehat_encounter_id ? 'encounter' : '',
  ].filter(Boolean);
  const baselineResourceIds = {
    organization: visit.polyclinic?.satusehat_organization_id || '',
    location: visit.polyclinic?.satusehat_location_id || '',
    patient: visit.patient?.satusehat_patient_id || '',
    practitioner: visit.doctor?.satusehat_practitioner_id || '',
    encounter: visit.satusehat_encounter_id || '',
  };
  const canRunAutoSync = hasAnyPermission(['settings.update', 'visits.update']);
  const canMonitorAutoSync = hasAnyPermission(['settings.view', 'visits.view']);

  // Poll for progress updates while dialog is open and job is running/queued
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const monitorSourceRef = useRef<'view' | 'run' | null>(null);
  const isJobActive = monitorResult?.job_status === 'queued' || monitorResult?.job_status === 'running';

  const fetchLatestSnapshot = useCallback(async () => {
    if (!visit.id) return;
    try {
      const response = await satusehatApi.getAutoSyncVisit(visit.id);
      const nextResult = response.data?.data || null;
      const nextMessage = (response.data?.message || '').trim();
      if (nextResult) {
        setMonitorResult(nextResult);
        if (nextMessage) setMonitorMessage(nextMessage);
        persistMonitorSnapshot(visit.id, nextResult, nextMessage);
      }
    } catch {
      // Ignore polling errors
    }
  }, [visit.id]);

  useEffect(() => {
    if (monitorDialogOpen && monitorAutoRefreshEnabled && isJobActive) {
      pollIntervalRef.current = setInterval(fetchLatestSnapshot, 3000);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [monitorAutoRefreshEnabled, monitorDialogOpen, isJobActive, fetchLatestSnapshot]);

  useEffect(() => {
    if (monitorDialogOpen) {
      return;
    }

    monitorAutoRefreshEnabled && setMonitorAutoRefreshEnabled(false);
    if (monitorSourceRef.current === 'view') {
      monitorSourceRef.current = null;
    }
  }, [monitorAutoRefreshEnabled, monitorDialogOpen]);

  // Notify parent when async job completes (detected by polling)
  const prevJobStatusRef = useRef(monitorResult?.job_status);
  useEffect(() => {
    const prevStatus = prevJobStatusRef.current;
    const currStatus = monitorResult?.job_status;
    prevJobStatusRef.current = currStatus;

    if ((prevStatus === 'queued' || prevStatus === 'running') && (currStatus === 'completed' || currStatus === 'failed')) {
      toast({
        variant: currStatus === 'completed' ? 'success' : 'destructive',
        title: currStatus === 'completed' ? 'Auto-sync SATUSEHAT selesai' : 'Auto-sync SATUSEHAT gagal',
        description: `${monitorResult?.sent_count || 0} resource terkirim, ${monitorResult?.unsent_count || 0} belum terkirim.`,
      });
      setMonitorAutoRefreshEnabled(false);
      if (monitorSourceRef.current === 'run') {
        onEncounterSynced?.();
      }
    }
  }, [monitorResult?.job_status, monitorResult?.sent_count, monitorResult?.unsent_count, onEncounterSynced, toast]);

  useEffect(() => {
    const snapshot = loadStoredMonitorSnapshot(visit.id);
    setMonitorResult(snapshot.result);
    setMonitorMessage(snapshot.message);
  }, [visit.id]);

  useEffect(() => {
    if (!prefetchedMonitorResult) {
      return;
    }

    setMonitorResult(prefetchedMonitorResult);
    const nextMessage = (prefetchedMonitorMessage || '').trim();
    if (nextMessage) {
      setMonitorMessage(nextMessage);
    }
    persistMonitorSnapshot(visit.id, prefetchedMonitorResult, nextMessage);
  }, [prefetchedMonitorMessage, prefetchedMonitorResult]);

  const handleOpenMonitor = async () => {
    monitorSourceRef.current = 'view';
    setMonitorAutoRefreshEnabled(false);
    setMonitorDialogOpen(true);

    if (monitorResult || monitorMessage.trim()) {
      return;
    }

    if (!monitorResult) {
      setMonitorMessage('Monitor hanya menampilkan snapshot terakhir. Jalankan auto-sync atau finalisasi kunjungan untuk memperbarui data.');
    }
  };

  const handleRunAutoSync = async () => {
    if (!visit.id || runningAutoSync) {
      return;
    }

    setRunningAutoSync(true);
    try {
      const response = await satusehatApi.autoSyncVisit(visit.id, true);
      const nextResult = response.data?.data || null;
      const nextMessage = response.data?.message || 'Auto-sync SATUSEHAT diproses.';
      const backgroundRun = response.status === 202 || nextResult?.job_status === 'queued' || nextResult?.job_status === 'running';
      monitorSourceRef.current = 'run';
      setMonitorAutoRefreshEnabled(backgroundRun);
      setMonitorResult(nextResult);
      setMonitorMessage(nextMessage);
      persistMonitorSnapshot(visit.id, nextResult, nextMessage);
      setMonitorDialogOpen(true);
      toast({
        variant: 'success',
        title: backgroundRun ? 'Auto-sync berjalan di background' : 'Auto-sync SATUSEHAT selesai',
        description: backgroundRun
          ? 'Sinkronisasi berjalan di background. Anda bisa lanjut mengisi rekam medis dan memantau progres di monitor.'
          : `${response.data?.data?.sent_count || 0} resource terkirim, ${response.data?.data?.unsent_count || 0} belum terkirim.`,
      });
      if (!backgroundRun) {
        await onEncounterSynced?.();
      }
    } catch (error: any) {
      const backendMessage = error.response?.data?.error || 'Auto-sync SATUSEHAT gagal dijalankan.';
      const errorResult = error.response?.data?.data as SatusehatVisitAutoSyncResult | undefined;
      monitorSourceRef.current = 'run';
      setMonitorAutoRefreshEnabled(false);
      if (errorResult) {
        setMonitorResult(errorResult);
        setMonitorMessage(backendMessage);
        persistMonitorSnapshot(visit.id, errorResult, backendMessage);
        setMonitorDialogOpen(true);
      }
      toast({
        variant: 'destructive',
        title: 'Auto-sync SATUSEHAT gagal',
        description: backendMessage,
      });
    } finally {
      setRunningAutoSync(false);
    }
  };

  return (
    <>
      <SatusehatAutoSyncMonitorDialog
        open={monitorDialogOpen}
        onOpenChange={setMonitorDialogOpen}
        visitNumber={visit.visit_number || '-'}
        message={monitorMessage}
        result={monitorResult}
        encounterRequirements={encounterRequirements}
        baselineReadyNodes={baselineReadyNodes}
        baselineResourceIds={baselineResourceIds}
      />

      <PatientDetailDialog
        open={patientModalOpen}
        onOpenChange={setPatientModalOpen}
        visit={visit}
        allergyInfo={allergyInfo}
        encounterRequirements={encounterRequirements}
      />

      <div
        className={cn(
          'border-b border-border bg-card shadow-none',
          sticky && 'sticky top-0 z-40'
        )}
        style={stickyOffsetStyle}
      >
        <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={onBack}
              title="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-foreground truncate">
                  {visit.patient?.full_name || '-'}
                </h1>
                <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
                  RM: {visit.patient?.medical_record_number || '-'}
                </Badge>
                <Badge variant="outline" className="rounded-none text-xs shadow-none">
                  #{visit.visit_number}
                </Badge>
                <Badge variant={isLocked ? 'default' : 'secondary'} className="rounded-none text-xs shadow-none uppercase">
                  {isLocked ? 'Kunjungan Final' : 'Workspace Aktif'}
                </Badge>
                <Badge className={visit.satusehat_encounter_id ? 'rounded-none border-0 bg-emerald-600 px-2 text-xs uppercase tracking-wide text-white shadow-none' : encounterReady ? 'rounded-none border-0 bg-amber-500 px-2 text-xs uppercase tracking-wide text-white shadow-none' : 'rounded-none border-0 bg-slate-500 px-2 text-xs uppercase tracking-wide text-white shadow-none'}>
                  {visit.satusehat_encounter_id ? 'Encounter Sync' : `${encounterReadyCount}/4 Encounter`}
                </Badge>
                <Badge variant="outline" className="rounded-none text-xs shadow-none hidden sm:inline-flex">
                  {completedSections}/{CORE_COMPLETION_TOTAL} inti lengkap
                </Badge>
                {sectionLabel ? (
                  <Badge variant="outline" className="rounded-none text-xs shadow-none border-primary/40 bg-primary/5 text-primary">
                    Form {sectionLabel}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{visit.polyclinic?.name || '-'}</span>
                <span>•</span>
                <span>dr. {visit.doctor?.full_name || '-'}</span>
                <span>•</span>
                <span className="font-mono font-semibold">Antrian #{String(visit.queue_number).padStart(3, '0')}</span>
                <span>•</span>
                <span>{formatDateTime(visit.visit_date)}</span>
                <span>•</span>
                <span className="uppercase">{visit.payment_type || '-'}</span>
                {allergyLabel ? (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-destructive">Alergi tercatat</span>
                  </>
                ) : null}
                {statusNote ? (
                  <>
                    <span>•</span>
                    {statusNote}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => setPatientModalOpen(true)}
              title="Data Pasien & Kunjungan"
            >
              <User className="h-4 w-4 text-primary" />
            </Button>

            {canMonitorAutoSync ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={handleOpenMonitor}
                title="Pantau hasil Auto Sync SATUSEHAT"
                disabled={!visit.id}
              >
                <Eye className="h-4 w-4" />
              </Button>
            ) : null}

            {canRunAutoSync ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => void handleRunAutoSync()}
                disabled={runningAutoSync}
                title="Jalankan Auto Sync SATUSEHAT untuk encounter ini"
              >
                {runningAutoSync ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            ) : null}

            {actions}
          </div>
        </div>
      </div>
    </>
  );
}
