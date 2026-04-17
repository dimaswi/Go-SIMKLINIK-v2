import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBpjsAntreanEnabled } from '@/hooks/use-bpjs-antrean-enabled';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi, visitsApi, type FinalizeVisitPayload, type SatusehatVisitAutoSyncResult } from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { setPageTitle } from '@/lib/page-title';
import { FinalizedVisitActions } from './components/finalized-visit-actions';
import { FinalizeVisitDialog } from './components/finalize-visit-dialog';
import { openPdfDocumentInNewWindow } from './print-document';
import { SheetWorkspaceTable } from './components/sheet-workspace-table';
import { StickyVisitHeader } from './components/sticky-visit-header';
import { buildSatusehatAutoSyncSummary, getCompletedCoreSections, getFinalizeVisitBlockingOrders, getLatestRecordForSection, groupRecordsBySection } from './utils';
import { useVisitEmr } from './use-visit-emr';
import { useVisitOdontogramEntries } from './use-visit-odontogram';

export default function EMRWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const visitId = Number(id);
  const { bpjsAntreanEnabled } = useBpjsAntreanEnabled();

  const { visit, records, loading, error, reload } = useVisitEmr(visitId);
  const { entries: odontogramEntries, loading: loadingOdontogram, error: odontogramError } = useVisitOdontogramEntries(visitId);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [printingControlLetter, setPrintingControlLetter] = useState(false);
  const [printingResumeMedical, setPrintingResumeMedical] = useState(false);
  const [cancelingFinalization, setCancelingFinalization] = useState(false);
  const [callingBPJS, setCallingBPJS] = useState(false);
  const [latestAutoSyncResult, setLatestAutoSyncResult] = useState<SatusehatVisitAutoSyncResult | null>(null);
  const [latestAutoSyncMessage, setLatestAutoSyncMessage] = useState('');

  const recordsBySection = useMemo(() => groupRecordsBySection(records), [records]);

  const completedSections = useMemo(
    () => getCompletedCoreSections(recordsBySection),
    [recordsBySection]
  );
  const allergyInfo = useMemo(() => {
    const values = [
      visit?.patient?.allergies,
      ...records.map((record) => record.allergy_notes),
    ]
      .map((value) => (value || '').trim())
      .filter(Boolean);

    return Array.from(new Set(values)).join(' | ');
  }, [records, visit?.patient?.allergies]);

  const workspaceLocked = visit?.status === 'completed' || visit?.status === 'cancelled';
  const finalizeVisitBlockers = useMemo(() => getFinalizeVisitBlockingOrders(recordsBySection), [recordsBySection]);
  const latestOutcomeRecord = useMemo(() => getLatestRecordForSection(recordsBySection, 'outcome'), [recordsBySection]);
  const controlLetterAvailable = useMemo(
    () => latestOutcomeRecord?.disposition?.trim().toLowerCase() === 'kontrol',
    [latestOutcomeRecord?.disposition]
  );
  const controlWhatsAppPayload = useMemo(
    () => createControlScheduleWhatsAppPayloadFromVisit(visit, latestOutcomeRecord),
    [latestOutcomeRecord, visit]
  );

  useEffect(() => {
    if (visit) {
      setPageTitle(`Rekam Medis — ${visit.patient?.full_name || visit.visit_number}`);
    }
  }, [visit]);

  useEffect(() => {
	if (odontogramError) {
		toast({ variant: 'destructive', title: 'Odontogram gagal dimuat', description: odontogramError });
	}
  }, [odontogramError, toast]);

  const finalizeVisit = async (payload: FinalizeVisitPayload) => {
    if (!visit) return;

    setFinalizing(true);
    try {
      const response = await medicalRecordsApi.finalizeVisit(visit.id, payload);
      const autoSyncSummary = buildSatusehatAutoSyncSummary(response.data?.satusehat_auto_sync);
      setLatestAutoSyncResult(response.data?.satusehat_auto_sync || null);
      setLatestAutoSyncMessage('Hasil auto-sync dari finalisasi kunjungan.');
      setFinalizeOpen(false);
      await reload();
      toast({
        title: 'Kunjungan berhasil di-finalisasi',
        description: payload.disposition === 'kontrol'
          ? `${autoSyncSummary.description} Surat kontrol siap dicetak.`
          : autoSyncSummary.description,
      });
      if (payload.disposition === 'kontrol') {
        void printControlLetter();
      }
    } catch (requestError: any) {
      const missingSections = requestError.response?.data?.missing_sections;
      const blockingOrders = requestError.response?.data?.blocking_orders;
      toast({
        variant: 'destructive',
        title: 'Gagal finalisasi kunjungan',
        description: Array.isArray(blockingOrders) && blockingOrders.length > 0
          ? `Selesaikan: ${blockingOrders.join(', ')}`
          : Array.isArray(missingSections) && missingSections.length > 0
          ? `Lengkapi: ${missingSections.join(', ')}`
          : requestError.response?.data?.error,
      });
    } finally {
      setFinalizing(false);
    }
  };

  const printControlLetter = async () => {
    if (!visit || printingControlLetter) return;

    setPrintingControlLetter(true);
    try {
      await openPdfDocumentInNewWindow({
        toast,
        loadingLabel: 'surat kontrol',
        preparingMessage: 'Menyiapkan surat kontrol...',
        blockedDescription: 'Izinkan popup untuk membuka surat kontrol dari backend.',
        errorTitle: 'Gagal menyiapkan surat kontrol',
        errorFallback: 'Surat kontrol tidak dapat dibuat.',
        request: () => medicalRecordsApi.printControlLetter(visit.id),
      });
    } finally {
      setPrintingControlLetter(false);
    }
  };

  const printMedicalResume = async () => {
    if (!visit || printingResumeMedical) return;

    setPrintingResumeMedical(true);
    try {
      await openPdfDocumentInNewWindow({
        toast,
        loadingLabel: 'resume medis',
        preparingMessage: 'Menyiapkan resume medis...',
        blockedDescription: 'Izinkan popup untuk membuka resume medis dari backend.',
        errorTitle: 'Gagal menyiapkan resume medis',
        errorFallback: 'Resume medis tidak dapat dibuat.',
        request: () => medicalRecordsApi.printMedicalResume(visit.id),
      });
    } finally {
      setPrintingResumeMedical(false);
    }
  };

  const cancelFinalization = async () => {
    if (!visit || cancelingFinalization) return;

    setCancelingFinalization(true);
    try {
      await medicalRecordsApi.cancelFinalization(visit.id);
      await reload();
      toast({ title: 'Finalisasi kunjungan berhasil dibatalkan' });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal membatalkan finalisasi',
        description: requestError.response?.data?.error,
      });
    } finally {
      setCancelingFinalization(false);
    }
  };

  const callBPJSQueue = async () => {
    if (!visit || callingBPJS) return;
    setCallingBPJS(true);
    try {
      await visitsApi.callBPJS(visit.id);
      toast({
        variant: 'success',
        title: 'Berhasil memanggil antrean BPJS',
        description: 'Status Hadir (1) berhasil dikirim ke BPJS.',
      });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memanggil BPJS',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memanggil API BPJS.',
      });
    } finally {
      setCallingBPJS(false);
    }
  };

  if (loading || loadingOdontogram) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!visit || error) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="rounded-xl border border-border/80 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Workspace rekam medis tidak tersedia</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Data kunjungan tidak ditemukan.'}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/emr')}>Kembali ke daftar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <StickyVisitHeader
        visit={visit}
        completedSections={completedSections}
        isLocked={Boolean(workspaceLocked)}
        allergyInfo={allergyInfo}
        onBack={() => navigate('/emr')}
        onEncounterSynced={reload}
        prefetchedMonitorResult={latestAutoSyncResult}
        prefetchedMonitorMessage={latestAutoSyncMessage}
        actions={!workspaceLocked ? (
          <div className="flex items-center gap-2">
            {bpjsAntreanEnabled ? (
              <Button variant="outline" className="gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800" onClick={callBPJSQueue} disabled={callingBPJS} title="Panggil Antrean BPJS">
                {callingBPJS ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="font-semibold">Panggil BPJS</span>}
              </Button>
            ) : null}
            <Button className="gap-1.5" onClick={() => setFinalizeOpen(true)} title='Final Kunjungan'>
              <Lock className="h-4 w-4" />
            </Button>
          </div>
        ) : visit.status === 'completed' ? (
          <FinalizedVisitActions
            visitId={visit.id}
            showControlLetter={controlLetterAvailable}
            controlWhatsAppPayload={controlWhatsAppPayload}
            onPrintControlLetter={printControlLetter}
            printingControlLetter={printingControlLetter}
            onPrintMedicalResume={printMedicalResume}
            printingMedicalResume={printingResumeMedical}
            onCancelFinalization={cancelFinalization}
            cancelingFinalization={cancelingFinalization}
          />
        ) : undefined}
      />

      <div className="space-y-5 px-4 py-5 lg:px-5">
        <section className="space-y-3">
          <SheetWorkspaceTable
            visitId={visit.id}
            recordsBySection={recordsBySection}
            visitLocked={Boolean(workspaceLocked)}
            odontogramEntries={odontogramEntries}
          />
        </section>
      </div>

      <FinalizeVisitDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        outcomeRecord={latestOutcomeRecord}
        blockers={finalizeVisitBlockers}
        submitting={finalizing}
        onSubmit={finalizeVisit}
      />
    </div>
  );
}
