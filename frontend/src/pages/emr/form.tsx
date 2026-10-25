import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilePlus2, Loader2, Lock, Save } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  type FinalizeVisitPayload,
  medicalRecordsApi,
  type MedicalActionMutationPayload,
  type MedicalRecord,
  type MedicalRecordSectionType,
  type SatusehatVisitAutoSyncResult,
} from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { setPageTitle } from '@/lib/page-title';
import { SECTION_CONFIGS, getSectionConfig } from './constants';
import { EntryTimeline } from './components/entry-timeline';
import { FinalizeVisitDialog } from './components/finalize-visit-dialog';
import { FinalizedVisitActions } from './components/finalized-visit-actions';
import { openPdfDocumentInNewWindow } from './print-document';
import { SectionEditorBody } from './components/section-editor-body';
import { StickyVisitHeader } from './components/sticky-visit-header';
import { buildDraft, buildSatusehatAutoSyncSummary, getCompletedCoreSections, getFinalizeVisitBlockingOrders, getLatestRecordForSection, groupRecordsBySection } from './utils';
import { useEmrReferences } from './use-emr-references';
import { useVisitEmr } from './use-visit-emr';
import { useVisitOdontogramEntries } from './use-visit-odontogram';
import type { MedicalRecordDraft } from './types';

function isSectionType(value: string | undefined): value is MedicalRecordSectionType {
  return SECTION_CONFIGS.some((section) => section.key === value);
}

export default function EMRFormPage() {
  const { id, section } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const visitId = Number(id);
  const activeSection = isSectionType(section) ? section : null;
  const needsOdontogramData = activeSection === 'procedure';

  const { visit, records, loading, error, reload, updateVisit, replaceRecords, upsertRecord, patchRecord } = useVisitEmr(visitId);
  const {
    entries: odontogramEntries,
    loading: loadingOdontogram,
    error: odontogramError,
    upsertEntry: upsertOdontogramEntry,
  } = useVisitOdontogramEntries(visitId, needsOdontogramData);
  const {
    icd10List,
    medicineList,
    serviceList,
    physicalExamImageList,
    loading: loadingReferences,
    error: referenceError,
  } = useEmrReferences(visitId);

  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MedicalRecordDraft>(buildDraft());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelingPrescriptionOrder, setCancelingPrescriptionOrder] = useState(false);
  const [cancelingLaboratoryOrder, setCancelingLaboratoryOrder] = useState(false);
  const [cancelingRadiologyOrder, setCancelingRadiologyOrder] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MedicalRecord | null>(null);
  const [cancelingEntry, setCancelingEntry] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [printingControlLetter, setPrintingControlLetter] = useState(false);
  const [printingResumeMedical, setPrintingResumeMedical] = useState(false);
  const [cancelingFinalization, setCancelingFinalization] = useState(false);
  const [latestAutoSyncResult, setLatestAutoSyncResult] = useState<SatusehatVisitAutoSyncResult | null>(null);
  const [latestAutoSyncMessage, setLatestAutoSyncMessage] = useState('');

  const recordsBySection = useMemo(() => groupRecordsBySection(records), [records]);
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

  const activeSectionConfig = activeSection ? getSectionConfig(activeSection) : null;
  const activeSectionRecords = activeSection ? recordsBySection[activeSection] || [] : [];

  const selectedRecord = useMemo<MedicalRecord | null>(() => {
    if (!activeSection) return null;
    return activeSectionRecords.find((record) => record.id === selectedRecordId)
      || activeSectionRecords.find((record) => record.status === 'draft')
      || activeSectionRecords[0]
      || null;
  }, [activeSection, activeSectionRecords, selectedRecordId]);

  const workspaceLocked = visit?.status === 'completed' || visit?.status === 'cancelled';
  const readOnly = Boolean(workspaceLocked || selectedRecord?.status === 'final' || selectedRecord?.status === 'cancelled');
  const isPrescriptionSection = activeSection === 'prescription';
  const isLaboratorySection = activeSection === 'laboratory';
  const isRadiologySection = activeSection === 'radiology';
  const canCancelPrescriptionOrder = Boolean(
    isPrescriptionSection
      && selectedRecord?.prescription_fulfillment_mode === 'internal'
      && selectedRecord?.prescription_workflow_status === 'ordered'
  );
  const canCancelLaboratoryOrder = Boolean(
    isLaboratorySection
      && selectedRecord?.laboratory_workflow_status === 'ordered'
  );
  const canCancelRadiologyOrder = Boolean(
    isRadiologySection
      && selectedRecord?.radiology_workflow_status === 'ordered'
  );
  const baselineDraft = useMemo(
    () => buildDraft(selectedRecord || undefined, visit || undefined),
    [selectedRecord?.id, selectedRecord?.updated_at, visit?.id]
  );
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(baselineDraft) !== JSON.stringify(draft),
    [baselineDraft, draft]
  );

  useEffect(() => {
    if (visit && activeSectionConfig) {
      setPageTitle(`Rekam Medis — ${visit.patient?.full_name || visit.visit_number} — ${activeSectionConfig.label}`);
    }
  }, [visit, activeSectionConfig]);

  useEffect(() => {
    if (referenceError) {
      toast({ variant: 'destructive', title: 'Referensi EMR gagal dimuat', description: referenceError });
    }
  }, [referenceError, toast]);

  useEffect(() => {
    if (odontogramError && needsOdontogramData) {
      toast({ variant: 'destructive', title: 'Odontogram gagal dimuat', description: odontogramError });
    }
  }, [needsOdontogramData, odontogramError, toast]);

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

  useEffect(() => {
    setDraft(buildDraft(selectedRecord || undefined, visit || undefined));
  }, [selectedRecord?.id, visit?.id, activeSection]);

  const createEntry = async () => {
    if (!visit || !activeSection) return;

    setCreating(true);
    try {
      const response = await medicalRecordsApi.create({ visit_id: visit.id, section_type: activeSection });
      const createdRecord: MedicalRecord = response.data.data;
      upsertRecord(createdRecord);
      setSelectedRecordId(createdRecord.id);
      updateVisit((currentVisit) => currentVisit
        ? { ...currentVisit, status: 'in_progress', queue_status: 'in_consultation' }
        : currentVisit
      );
      toast({ title: `${activeSectionConfig?.label || 'Entri'} berhasil dibuat` });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal membuat entri', description: requestError.response?.data?.error });
    } finally {
      setCreating(false);
    }
  };

  const saveSelectedRecord = async () => {
    if (!selectedRecord) return;

    setSaving(true);
    try {
      const response = await medicalRecordsApi.update(selectedRecord.id, draft);
      upsertRecord(response.data.data);
      if (draft.allergy_notes.trim()) {
        updateVisit((currentVisit) => currentVisit ? {
          ...currentVisit,
          patient: currentVisit.patient ? { ...currentVisit.patient, allergies: draft.allergy_notes.trim() } : currentVisit.patient,
        } : currentVisit);
      }
      toast({ title: 'Entri rekam medis berhasil disimpan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan entri', description: requestError.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await medicalRecordsApi.delete(deleteTarget.id);

      const remainingSectionRecords = activeSectionRecords.filter((record) => record.id !== deleteTarget.id);
      replaceRecords((currentRecords) => currentRecords.filter((record) => record.id !== deleteTarget.id));
      setSelectedRecordId((currentSelectedId) => {
        if (currentSelectedId !== deleteTarget.id) {
          return currentSelectedId;
        }

        return remainingSectionRecords.find((record) => record.status === 'draft')?.id
          || remainingSectionRecords[0]?.id
          || null;
      });
      setDeleteTarget(null);
      toast({ title: 'Entri rekam medis berhasil dihapus' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus entri', description: requestError.response?.data?.error });
    } finally {
      setDeleting(false);
    }
  };

  const cancelRecord = async () => {
    if (!cancelTarget) return;

    setCancelingEntry(true);
    try {
      const response = await medicalRecordsApi.cancel(cancelTarget.id);
      const updatedRecord: MedicalRecord = response.data.data;
      upsertRecord(updatedRecord);
      if (selectedRecord?.id === updatedRecord.id) {
        setDraft(buildDraft(updatedRecord, visit || undefined));
      }
      setCancelTarget(null);
      toast({ title: 'Entri rekam medis berhasil dibatalkan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal membatalkan entri', description: requestError.response?.data?.error });
    } finally {
      setCancelingEntry(false);
    }
  };

  const finalizeVisit = async (payload: FinalizeVisitPayload) => {
    if (!visit) return;

    setFinalizing(true);
    try {
      if (selectedRecord && !readOnly) {
        const saveResponse = await medicalRecordsApi.update(selectedRecord.id, draft);
        upsertRecord(saveResponse.data.data);
      }

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

  const addDiagnosis = async (payload: { icd10_id: number; diagnosis_type: 'primer' | 'sekunder'; working_diagnosis: string; differential_diagnosis: string; assessment_narrative: string; notes: string }) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addDiagnosis(selectedRecord.id, payload);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        diagnoses: [response.data.data, ...(record.diagnoses || [])],
        working_diagnosis: payload.diagnosis_type === 'primer'
          ? payload.working_diagnosis || record.working_diagnosis
          : record.working_diagnosis || payload.working_diagnosis,
        differential_diagnosis: payload.diagnosis_type === 'primer'
          ? payload.differential_diagnosis || record.differential_diagnosis
          : record.differential_diagnosis || payload.differential_diagnosis,
        assessment: payload.diagnosis_type === 'primer'
          ? payload.assessment_narrative || record.assessment
          : record.assessment || payload.assessment_narrative,
      }));
      setDraft((currentDraft) => ({
        ...currentDraft,
        working_diagnosis: payload.diagnosis_type === 'primer'
          ? payload.working_diagnosis || currentDraft.working_diagnosis
          : currentDraft.working_diagnosis || payload.working_diagnosis,
        differential_diagnosis: payload.diagnosis_type === 'primer'
          ? payload.differential_diagnosis || currentDraft.differential_diagnosis
          : currentDraft.differential_diagnosis || payload.differential_diagnosis,
        assessment: payload.diagnosis_type === 'primer'
          ? payload.assessment_narrative || currentDraft.assessment
          : currentDraft.assessment || payload.assessment_narrative,
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah diagnosis', description: requestError.response?.data?.error });
    }
  };

  const deleteDiagnosis = async (diagnosisId: number) => {
    if (!selectedRecord) return;

    try {
      await medicalRecordsApi.deleteDiagnosis(selectedRecord.id, diagnosisId);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        diagnoses: (record.diagnoses || []).filter((diagnosis) => diagnosis.id !== diagnosisId),
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus diagnosis', description: requestError.response?.data?.error });
    }
  };

  const addPrescription = async (payload: { medicine_id: number; quantity: number; dosage: string; frequency: string; duration: string; route: string; instructions: string; notes: string }) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addPrescription(selectedRecord.id, payload);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        prescriptions: [response.data.data, ...(record.prescriptions || [])],
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah resep', description: requestError.response?.data?.error });
    }
  };

  const deletePrescription = async (prescriptionId: number) => {
    if (!selectedRecord) return;

    try {
      await medicalRecordsApi.deletePrescription(selectedRecord.id, prescriptionId);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        prescriptions: (record.prescriptions || []).filter((prescription) => prescription.id !== prescriptionId),
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus resep', description: requestError.response?.data?.error });
    }
  };

  const cancelPrescriptionOrder = async () => {
    if (!selectedRecord) return;

    setCancelingPrescriptionOrder(true);
    try {
      const response = await medicalRecordsApi.cancelPrescriptionOrder(selectedRecord.id);
      const updatedRecord: MedicalRecord = response.data.data;
      upsertRecord(updatedRecord);
      setDraft(buildDraft(updatedRecord, visit || undefined));
      toast({ title: 'Order resep berhasil dibatalkan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal membatalkan order resep', description: requestError.response?.data?.error });
    } finally {
      setCancelingPrescriptionOrder(false);
    }
  };

  const cancelLaboratoryOrder = async () => {
    if (!selectedRecord) return;

    setCancelingLaboratoryOrder(true);
    try {
      const response = await medicalRecordsApi.cancelLaboratoryOrder(selectedRecord.id);
      const updatedRecord: MedicalRecord = response.data.data;
      upsertRecord(updatedRecord);
      setDraft(buildDraft(updatedRecord, visit || undefined));
      toast({ title: 'Order laboratorium berhasil dibatalkan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal membatalkan order laboratorium', description: requestError.response?.data?.error });
    } finally {
      setCancelingLaboratoryOrder(false);
    }
  };

  const cancelRadiologyOrder = async () => {
    if (!selectedRecord) return;

    setCancelingRadiologyOrder(true);
    try {
      const response = await medicalRecordsApi.cancelRadiologyOrder(selectedRecord.id);
      const updatedRecord: MedicalRecord = response.data.data;
      upsertRecord(updatedRecord);
      setDraft(buildDraft(updatedRecord, visit || undefined));
      toast({ title: 'Order radiologi berhasil dibatalkan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal membatalkan order radiologi', description: requestError.response?.data?.error });
    } finally {
      setCancelingRadiologyOrder(false);
    }
  };

  const refreshActionRecord = async (recordId: number) => {
    const refreshedRecordResponse = await medicalRecordsApi.getById(recordId);
    const refreshedRecord: MedicalRecord = refreshedRecordResponse.data.data;
    upsertRecord(refreshedRecord);
    return refreshedRecord;
  };

  const addAction = async (payload: MedicalActionMutationPayload) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addAction(selectedRecord.id, payload);
      await refreshActionRecord(selectedRecord.id);
      if (response.data.odontogram_entry) {
        upsertOdontogramEntry(response.data.odontogram_entry);
      }
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah tindakan', description: requestError.response?.data?.error });
    }
  };

  const updateAction = async (actionId: number, payload: MedicalActionMutationPayload) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.updateAction(selectedRecord.id, actionId, payload);
      await refreshActionRecord(selectedRecord.id);
      if (response.data.odontogram_entry) {
        upsertOdontogramEntry(response.data.odontogram_entry);
      }
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal memperbarui tindakan', description: requestError.response?.data?.error });
    }
  };

  const deleteAction = async (actionId: number) => {
    if (!selectedRecord) return;

    try {
      await medicalRecordsApi.deleteAction(selectedRecord.id, actionId);
      await refreshActionRecord(selectedRecord.id);
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus tindakan', description: requestError.response?.data?.error });
    }
  };

  if (!activeSection) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="border border-border/70 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Section form tidak valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">Section yang diminta tidak dikenali.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/emr')}>Kembali ke daftar</Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || loadingReferences || (needsOdontogramData && loadingOdontogram)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!visit || error) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="border border-border/70 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Form rekam medis tidak tersedia</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Data kunjungan tidak ditemukan.'}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/emr')}>Kembali ke daftar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:overflow-hidden">
      <StickyVisitHeader
        visit={visit}
        completedSections={completedSections}
        isLocked={Boolean(workspaceLocked)}
        sticky
        sectionLabel={activeSectionConfig?.label}
        allergyInfo={allergyInfo}
        onBack={() => navigate(`/emr/${visit.id}`)}
        onEncounterSynced={reload}
        prefetchedMonitorResult={latestAutoSyncResult}
        prefetchedMonitorMessage={latestAutoSyncMessage}
        statusNote={selectedRecord ? (
          <span className={hasUnsavedChanges ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
            {hasUnsavedChanges ? 'Perubahan belum disimpan' : 'Sudah tersimpan'}
          </span>
        ) : (
          <span className="text-muted-foreground">Pilih atau buat entri untuk mulai mencatat</span>
        )}
        actions={!workspaceLocked ? (
          <Button className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" onClick={() => setFinalizeOpen(true)} title='Final Kunjungan'>
            <Lock className="h-4 w-4" />
          </Button>
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
            buttonClassName="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
          />
        ) : undefined}
      />

      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1.5 lg:px-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <div className="grid gap-0 border border-border/70 bg-background xl:min-h-0 xl:flex-1 xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden">
          <aside className="border-b border-border/70 bg-background xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:border-b-0 xl:border-r xl:border-r-border/70">
            <div className="border-b border-border/70 px-3 py-3">
              <h2 className="text-sm font-semibold">Riwayat Entri {activeSectionConfig?.label}</h2>
              {!workspaceLocked && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={createEntry} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    Tambah Entri
                  </Button>
                  <Button className="gap-1.5 rounded-none shadow-none" onClick={saveSelectedRecord} disabled={!selectedRecord || readOnly || saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Entri
                  </Button>
                </div>
              )}
            </div>
            <div className="bg-background xl:min-h-0 xl:flex-1 xl:overflow-hidden">
              <EntryTimeline
                records={activeSectionRecords}
                selectedRecordId={selectedRecord?.id || null}
                onSelect={setSelectedRecordId}
                onEditRecord={setSelectedRecordId}
                onCancelRecord={!workspaceLocked ? setCancelTarget : undefined}
                onDeleteRecord={!workspaceLocked ? setDeleteTarget : undefined}
                borderless
                dirtyRecordId={hasUnsavedChanges ? selectedRecord?.id || null : null}
              />
            </div>
          </aside>

          <main className="min-w-0 bg-background xl:h-full xl:min-h-0 xl:overflow-hidden">
            <div className="px-3 py-3 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:[scrollbar-gutter:stable]">
              {selectedRecord ? (
                <SectionEditorBody
                  section={activeSection}
                  draft={draft}
                  setDraft={setDraft}
                  record={selectedRecord}
                  icd10List={icd10List}
                  medicineList={medicineList}
                  serviceList={serviceList}
                  physicalExamImageList={physicalExamImageList}
                  onAddDiagnosis={addDiagnosis}
                  onDeleteDiagnosis={deleteDiagnosis}
                  onAddPrescription={addPrescription}
                  onDeletePrescription={deletePrescription}
                  onCancelPrescriptionOrder={cancelPrescriptionOrder}
                  canCancelPrescriptionOrder={canCancelPrescriptionOrder}
                  prescriptionActionState={{
                    submitting: false,
                    canceling: cancelingPrescriptionOrder,
                    printingPrescription: false,
                    printingTicket: false,
                  }}
                  onCancelLaboratoryOrder={cancelLaboratoryOrder}
                  canCancelLaboratoryOrder={canCancelLaboratoryOrder}
                  laboratoryActionState={{
                    canceling: cancelingLaboratoryOrder,
                    printingTicket: false,
                    printingResult: false,
                  }}
                  onCancelRadiologyOrder={cancelRadiologyOrder}
                  canCancelRadiologyOrder={canCancelRadiologyOrder}
                  radiologyActionState={{
                    canceling: cancelingRadiologyOrder,
                    printingTicket: false,
                    printingResult: false,
                  }}
                  onAddAction={addAction}
                  onUpdateAction={updateAction}
                  onDeleteAction={deleteAction}
                  odontogramEntries={odontogramEntries}
                  readOnly={readOnly}
                />
              ) : (
                <section className="border-t border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                  Belum ada entri pada section ini. Buat entri baru untuk mulai mencatat.
                </section>
              )}
            </div>
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        onConfirm={cancelRecord}
        title="Batalkan Entri"
        description="Entri yang dibatalkan akan menjadi nonaktif dan baru bisa dihapus setelah statusnya batal."
        confirmText={cancelingEntry ? 'Membatalkan...' : 'Batalkan Entri'}
        cancelText="Tutup"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={deleteRecord}
        title="Hapus Entri"
        description="Hanya entri berstatus batal yang dapat dihapus, dan penghapusan ini tidak bisa dikembalikan."
        confirmText={deleting ? 'Menghapus...' : 'Hapus'}
        cancelText="Batal"
        variant="destructive"
      />

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
