import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { satusehatApi, type SatusehatVisitAutoSyncResult, type Visit } from '@/lib/api';
import { ChevronDown, ChevronRight, Eye, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CORE_COMPLETION_TOTAL } from '../constants';
import { compactAddress, formatDate, formatDateTime, getPatientAge } from '../utils';
import { SatusehatAutoSyncMonitorDialog } from './satusehat-auto-sync-monitor-dialog';

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
  const [isPatientInfoCollapsed, setIsPatientInfoCollapsed] = useState(true);
  const [runningAutoSync, setRunningAutoSync] = useState(false);
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [monitorAutoRefreshEnabled, setMonitorAutoRefreshEnabled] = useState(false);
  const [monitorResult, setMonitorResult] = useState<SatusehatVisitAutoSyncResult | null>(null);
  const [monitorMessage, setMonitorMessage] = useState('');
  const patient = visit.patient;
  const age = getPatientAge(patient?.birth_date);
  const genderLabel = patient?.gender === 'L' ? 'Laki-laki' : patient?.gender === 'P' ? 'Perempuan' : '-';
  const addressLabel = compactAddress([
    patient?.address,
    patient?.kelurahan,
    patient?.kecamatan,
    patient?.city,
  ]) || '-';
  const insuranceLabel = [patient?.insurance_type, patient?.insurance_number].filter(Boolean).join(' / ') || '-';
  const emergencyLabel = [patient?.emergency_contact_name, patient?.emergency_contact_relation].filter(Boolean).join(' · ');
  const allergyLabel = (allergyInfo || patient?.allergies || '').trim();
  const ToggleIcon = isPatientInfoCollapsed ? ChevronRight : ChevronDown;
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
      // Start polling every 3 seconds
      pollIntervalRef.current = setInterval(fetchLatestSnapshot, 3000);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }

    // Clear interval when dialog closes or job completes
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
  }, [monitorResult?.job_status]);

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

      <div className={sticky ? 'sticky z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85' : 'border-b border-border/60 bg-background'} style={stickyOffsetStyle}>
        <div className="px-4 py-2.5 lg:px-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
            <button
              type="button"
              onClick={() => setIsPatientInfoCollapsed((current) => !current)}
              aria-expanded={!isPatientInfoCollapsed}
              className="w-full min-w-0 text-left lg:flex-1"
            >
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant={isLocked ? 'default' : 'secondary'} className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
                  {isLocked ? 'Kunjungan Final' : 'Workspace Aktif'}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none">{visit.visit_number}</Badge>
                <Badge variant="outline" className="hidden h-5 rounded-none px-2 text-[10px] font-medium shadow-none sm:inline-flex">{completedSections}/{CORE_COMPLETION_TOTAL} inti lengkap</Badge>
                <Badge className={visit.satusehat_encounter_id ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : encounterReady ? 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-slate-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
                  {visit.satusehat_encounter_id ? 'Encounter Sync' : `${encounterReadyCount}/4 Encounter`}
                </Badge>
                {sectionLabel ? <Badge variant="outline" className="hidden h-5 rounded-none px-2 text-[10px] font-medium shadow-none sm:inline-flex">Form {sectionLabel}</Badge> : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-[15px] font-semibold tracking-tight lg:text-base">{visit.patient?.full_name || '-'}</h1>
                <span className="text-xs text-muted-foreground">RM {visit.patient?.medical_record_number || '-'}</span>
                <span className="text-xs text-muted-foreground">{visit.polyclinic?.name || '-'}</span>
                <span className="text-xs text-muted-foreground">dr. {visit.doctor?.full_name || '-'}</span>
                <ToggleIcon className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Tanggal {formatDateTime(visit.visit_date)}</span>
                <span>Antrian {String(visit.queue_number).padStart(3, '0')}</span>
                <span>Pembayaran {visit.payment_type || '-'}</span>
                <span>Encounter {visit.satusehat_encounter_id ? 'tersinkron' : encounterReady ? 'siap sync' : 'belum siap'}</span>
                {allergyLabel ? <span className="font-medium text-destructive">Alergi tercatat</span> : null}
                {statusNote}
              </div>

              {!isPatientInfoCollapsed ? (
                <>
                  <div className="mt-2 grid gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                    <span>
                      JK / Usia: <span className="font-medium text-foreground">{genderLabel}{age !== null ? `, ${age} th` : ''}</span>
                    </span>
                    <span>
                      Lahir: <span className="font-medium text-foreground">{patient?.birth_place || '-'}{patient?.birth_date ? `, ${formatDate(patient.birth_date)}` : ''}</span>
                    </span>
                    <span>
                      Telepon: <span className="font-medium text-foreground">{patient?.phone || '-'}</span>
                    </span>
                    <span>
                      Gol. darah: <span className="font-medium text-foreground">{patient?.blood_type || '-'}</span>
                    </span>
                    <span className="md:col-span-2 xl:col-span-2">
                      Alamat: <span className="font-medium text-foreground">{addressLabel}</span>
                    </span>
                    <span>
                      Penjamin: <span className="font-medium text-foreground">{insuranceLabel}</span>
                    </span>
                    <span>
                      Encounter SATUSEHAT: <span className="font-medium text-foreground">{visit.satusehat_encounter_id || (encounterReady ? 'Siap sync' : 'Lengkapi patient, practitioner, organization, location')}</span>
                    </span>
                    <span>
                      Alergi: <span className={allergyLabel ? 'font-medium text-destructive' : 'font-medium text-foreground'}>{allergyLabel || 'Tidak tercatat'}</span>
                    </span>
                    <span className="md:col-span-2 xl:col-span-2">
                      Kontak darurat: <span className="font-medium text-foreground">{emergencyLabel || '-'}{patient?.emergency_contact_phone ? ` (${patient.emergency_contact_phone})` : ''}</span>
                    </span>
                  </div>

                  <div className="mt-2 grid gap-2 border-t border-border/60 pt-2 md:grid-cols-2 xl:grid-cols-4">
                    {encounterRequirements.map((item) => (
                      <div key={item.label} className="border border-border/60 bg-muted/[0.03] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                          <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-none px-1.5 text-[10px]">
                            {item.ready ? 'Ready' : 'Missing'}
                          </Badge>
                        </div>
                        <p className="mt-1 break-words text-[11px] leading-5 text-foreground/90">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Sync terakhir Encounter: <span className="font-medium text-foreground">{formatDateTime(visit.satusehat_synced_at)}</span>
                  </p>

                  <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">
                    Keluhan awal: <span className="text-foreground/90">{visit.complaint || 'Belum ada keluhan pendaftaran.'}</span>
                  </p>
                </>
              ) : null}
            </button>

            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <Button variant="outline" className="rounded-none shadow-none" onClick={onBack}>Kembali</Button>
              {canMonitorAutoSync ? (
                <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={handleOpenMonitor} title="Pantau hasil Auto Sync SATUSEHAT" disabled={!visit.id}>
                  <Eye className="h-4 w-4" />
                </Button>
              ) : null}
              {canRunAutoSync ? (
                <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={() => void handleRunAutoSync()} disabled={runningAutoSync} title="Jalankan Auto Sync SATUSEHAT untuk encounter ini">
                  {runningAutoSync ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              ) : null}
              {actions}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
