import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilePlus2, Loader2, Lock, Save, Send } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  informedConsentsApi,
  medicalRecordsApi,
  type FinalizeVisitPayload,
  type MedicalActionMutationPayload,
  type MedicalRecord,
  type MedicalRecordSectionType,
  type SatusehatVisitAutoSyncResult,
  type UpdateInformedConsentPayload,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { VISIBLE_SHEET_CONFIGS, getSectionConfig, getSheetConfig, isInitialAssessmentSheetKey } from './constants';
import { EntryTimeline } from './components/entry-timeline';
import { FinalizeVisitDialog } from './components/finalize-visit-dialog';
import { FinalizedVisitActions } from './components/finalized-visit-actions';
import { InformedConsentSheetPage } from './components/informed-consent-sheet-page';
import { InitialAssessmentSheetPage } from './components/initial-assessment-sheet-page';
import { OdontogramSheetPage } from './components/odontogram-sheet-page';
import { openPdfDocumentInNewWindow } from './print-document';
import { ResumeSheetView } from './components/resume-sheet-view';
import { SectionEditorBody } from './components/section-editor-body';
import { SectionStatusBadge } from './components/section-status-badge';
import { SheetPlaceholder } from './components/sheet-placeholder';
import { StickyVisitHeader } from './components/sticky-visit-header';
import {
  buildDraft,
  buildSatusehatAutoSyncSummary,
  collectVisitInformedConsents,
  getFinalizeVisitBlockingOrders,
  getCompletedCoreSections,
  getLatestRecordForSection,
  getRecordsForSheetSections,
  getSectionRowStatus,
  getSheetStatus,
  groupRecordsBySection,
} from './utils';
import { useEmrReferences } from './use-emr-references';
import { useVisitEmr } from './use-visit-emr';
import { useVisitOdontogramEntries } from './use-visit-odontogram';
import type { MedicalRecordDraft, MedicalSheetKey } from './types';

function isSheetKey(value: string | undefined): value is MedicalSheetKey {
  return VISIBLE_SHEET_CONFIGS.some((sheet) => sheet.key === value);
}

export default function EMRSheetPage() {
  const { id, sheet } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const visitId = Number(id);
  const activeSheetKey = isSheetKey(sheet) ? sheet : null;
  const activeSheetConfig = activeSheetKey ? getSheetConfig(activeSheetKey) : null;
  const isOdontogramSheet = activeSheetConfig?.kind === 'odontogram';
  const needsOdontogramData = isOdontogramSheet || Boolean(activeSheetConfig?.sections.includes('procedure'));

  const { visit, records, loading, error, reload, updateVisit, replaceRecords, upsertRecord, patchRecord } = useVisitEmr(visitId);
  const {
	entries: odontogramEntries,
	loading: loadingOdontogram,
	error: odontogramError,
	replaceEntries: replaceOdontogramEntries,
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
  const readOnlySetDraft: typeof setDraft = () => undefined;
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittingPrescriptionOrder, setSubmittingPrescriptionOrder] = useState(false);
  const [submittingLaboratoryOrder, setSubmittingLaboratoryOrder] = useState(false);
  const [submittingRadiologyOrder, setSubmittingRadiologyOrder] = useState(false);
  const [cancelingPrescriptionOrder, setCancelingPrescriptionOrder] = useState(false);
  const [cancelingLaboratoryOrder, setCancelingLaboratoryOrder] = useState(false);
  const [cancelingRadiologyOrder, setCancelingRadiologyOrder] = useState(false);
  const [printingPrescriptionOrder, setPrintingPrescriptionOrder] = useState(false);
  const [printingPharmacyTicket, setPrintingPharmacyTicket] = useState(false);
  const [printingLaboratoryTicket, setPrintingLaboratoryTicket] = useState(false);
  const [printingLaboratoryResult, setPrintingLaboratoryResult] = useState(false);
  const [printingRadiologyTicket, setPrintingRadiologyTicket] = useState(false);
  const [printingRadiologyResult, setPrintingRadiologyResult] = useState(false);
  const [printingProcedure, setPrintingProcedure] = useState(false);
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
  const [activeSection, setActiveSection] = useState<MedicalRecordSectionType | null>(activeSheetConfig?.defaultSection || null);

  const recordsBySection = useMemo(() => groupRecordsBySection(records), [records]);
  const completedSections = useMemo(() => getCompletedCoreSections(recordsBySection), [recordsBySection]);
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
  const allergyInfo = useMemo(() => {
    const values = [visit?.patient?.allergies, ...records.map((record) => record.allergy_notes)]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    return Array.from(new Set(values)).join(' | ');
  }, [records, visit?.patient?.allergies]);

  useEffect(() => {
    setActiveSection(activeSheetConfig?.defaultSection || null);
    setSelectedRecordId(null);
  }, [activeSheetConfig?.key, activeSheetConfig?.defaultSection]);

  useEffect(() => {
    if (visit && activeSheetConfig) {
      setPageTitle(`Rekam Medis — ${visit.patient?.full_name || visit.visit_number} — ${activeSheetConfig.label}`);
    }
  }, [visit, activeSheetConfig]);

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

  const editableSection = useMemo<MedicalRecordSectionType | null>(() => {
    if (!activeSheetConfig) return null;
    if (activeSheetConfig.kind === 'resume') return 'outcome';
    if (activeSheetConfig.kind === 'section-editor') return activeSection;
    return null;
  }, [activeSection, activeSheetConfig]);

  const activeSectionConfig = editableSection ? getSectionConfig(editableSection) : null;
  const activeSectionRecords = editableSection ? recordsBySection[editableSection] || [] : [];

  const selectedRecord = useMemo<MedicalRecord | null>(() => {
    if (!editableSection) return null;

    return activeSectionRecords.find((record) => record.id === selectedRecordId)
      || activeSectionRecords.find((record) => record.status === 'draft')
      || activeSectionRecords[0]
      || null;
  }, [activeSectionRecords, editableSection, selectedRecordId]);

  const visibleSectionRecords = useMemo(() => {
    if (!activeSheetConfig || activeSheetConfig.kind !== 'section-editor') {
      return {} as Partial<Record<MedicalRecordSectionType, MedicalRecord | null>>;
    }

    return activeSheetConfig.sections.reduce((result, section) => {
      const sectionRecords = recordsBySection[section] || [];
      result[section] = section === activeSection
        ? selectedRecord
        : sectionRecords.find((record) => record.status === 'draft') || sectionRecords[0] || null;
      return result;
    }, {} as Partial<Record<MedicalRecordSectionType, MedicalRecord | null>>);
  }, [activeSection, activeSheetConfig, recordsBySection, selectedRecord]);

  const editorSections = useMemo(() => {
    if (!activeSheetConfig || activeSheetConfig.kind !== 'section-editor') return [] as MedicalRecordSectionType[];
    if (activeSheetConfig.key === 'lembar-penunjang' || activeSheetConfig.key === 'lembar-tindakan-kecil') {
      return activeSection ? [activeSection] : [];
    }
    return activeSheetConfig.sections;
  }, [activeSection, activeSheetConfig]);

  const workspaceLocked = visit?.status === 'completed' || visit?.status === 'cancelled';
  const prescriptionWorkflowLocked = editableSection === 'prescription' && Boolean(selectedRecord?.prescription_workflow_status && selectedRecord?.prescription_workflow_status !== 'draft');
  const laboratoryWorkflowLocked = editableSection === 'laboratory' && Boolean(selectedRecord?.laboratory_workflow_status && selectedRecord?.laboratory_workflow_status !== 'draft');
  const radiologyWorkflowLocked = editableSection === 'radiology' && Boolean(selectedRecord?.radiology_workflow_status && selectedRecord?.radiology_workflow_status !== 'draft');
  const readOnly = Boolean(workspaceLocked || selectedRecord?.status === 'final' || selectedRecord?.status === 'cancelled' || prescriptionWorkflowLocked || laboratoryWorkflowLocked || radiologyWorkflowLocked);
  const baselineDraft = useMemo(() => buildDraft(selectedRecord || undefined, visit || undefined), [selectedRecord?.id, selectedRecord?.updated_at, visit?.id]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(baselineDraft) !== JSON.stringify(draft), [baselineDraft, draft]);
  const isPrescriptionSection = editableSection === 'prescription';
  const isLaboratorySection = editableSection === 'laboratory';
  const isRadiologySection = editableSection === 'radiology';
  const prescriptionItemCount = (selectedRecord?.prescriptions?.length || 0) + (selectedRecord?.prescription_compounds?.length || 0);
  const laboratoryItemCount = selectedRecord?.laboratory_order_items?.length || 0;
  const radiologyItemCount = selectedRecord?.radiology_order_items?.length || 0;
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
  const primaryActionIsInternalSend = isPrescriptionSection && draft.prescription_fulfillment_mode === 'internal';
  const primaryActionMode = primaryActionIsInternalSend
    ? 'prescription-submit'
    : isLaboratorySection
      ? 'laboratory-submit'
      : isRadiologySection
        ? 'radiology-submit'
        : 'save';

  useEffect(() => {
    setDraft(buildDraft(selectedRecord || undefined, visit || undefined));
  }, [selectedRecord?.id, visit?.id, editableSection]);

  const createEntry = async () => {
    if (!visit || !editableSection) return;

    setCreating(true);
    try {
      const response = await medicalRecordsApi.create({ visit_id: visit.id, section_type: editableSection });
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

  const syncSelectedRecordDraft = async () => {
    if (!selectedRecord) return;

    const response = await medicalRecordsApi.update(selectedRecord.id, draft);
    const updatedRecord: MedicalRecord = response.data.data;
    upsertRecord(updatedRecord);
    if (draft.allergy_notes.trim()) {
      updateVisit((currentVisit) => currentVisit ? {
        ...currentVisit,
        patient: currentVisit.patient ? { ...currentVisit.patient, allergies: draft.allergy_notes.trim() } : currentVisit.patient,
      } : currentVisit);
    }

    return updatedRecord;
  };

  const saveSelectedRecord = async () => {
    if (!selectedRecord) return;

    setSaving(true);
    try {
      await syncSelectedRecordDraft();
      toast({ title: 'Entri rekam medis berhasil disimpan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan entri', description: requestError.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  const saveAndSubmitPrescriptionOrder = async () => {
    if (!selectedRecord) return;

    setSubmittingPrescriptionOrder(true);
    try {
      const updatedRecord = await syncSelectedRecordDraft();
      const response = await medicalRecordsApi.submitPrescriptionOrder((updatedRecord || selectedRecord).id);
      upsertRecord(response.data.data);
      toast({ title: 'Order resep berhasil dikirim ke farmasi' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal mengirim order resep', description: requestError.response?.data?.error });
    } finally {
      setSubmittingPrescriptionOrder(false);
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget || !editableSection) return;

    setDeleting(true);
    try {
      await medicalRecordsApi.delete(deleteTarget.id);
      const remainingSectionRecords = activeSectionRecords.filter((record) => record.id !== deleteTarget.id);
      replaceRecords((currentRecords) => currentRecords.filter((record) => record.id !== deleteTarget.id));
      setSelectedRecordId((currentSelectedId) => {
        if (currentSelectedId !== deleteTarget.id) return currentSelectedId;

        return remainingSectionRecords.find((record) => record.status === 'draft')?.id || remainingSectionRecords[0]?.id || null;
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

  const finalizeVisit = async (payload: FinalizeVisitPayload, options?: { saveSelectedRecord?: boolean }) => {
    if (!visit) return;

    setFinalizing(true);
    try {
      if (options?.saveSelectedRecord !== false && selectedRecord && !readOnly) {
        await syncSelectedRecordDraft();
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

  const addPrescriptionCompound = async (payload: {
    name: string;
    preparation_type: string;
    output_quantity: number;
    output_unit: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: string;
    instructions: string;
    notes: string;
    items: Array<{ medicine_id: number; quantity: number; notes: string }>;
  }) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addPrescriptionCompound(selectedRecord.id, payload);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        prescription_compounds: [response.data.data, ...(record.prescription_compounds || [])],
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah obat racikan', description: requestError.response?.data?.error });
    }
  };

  const deletePrescriptionCompound = async (compoundId: number) => {
    if (!selectedRecord) return;

    try {
      await medicalRecordsApi.deletePrescriptionCompound(selectedRecord.id, compoundId);
      patchRecord(selectedRecord.id, (record) => ({
        ...record,
        prescription_compounds: (record.prescription_compounds || []).filter((compound) => compound.id !== compoundId),
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus obat racikan', description: requestError.response?.data?.error });
    }
  };

  const submitPrescriptionOrder = async () => {
    if (!selectedRecord) return;

    setSubmittingPrescriptionOrder(true);
    try {
      const response = await medicalRecordsApi.submitPrescriptionOrder(selectedRecord.id);
      upsertRecord(response.data.data);
      toast({ title: 'Order resep berhasil dikirim ke farmasi' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal mengirim order resep', description: requestError.response?.data?.error });
    } finally {
      setSubmittingPrescriptionOrder(false);
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

  const printPrescriptionOrder = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingPrescriptionOrder(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'dokumen resep',
        preparingMessage: 'Menyiapkan dokumen resep...',
        errorTitle: 'Gagal menyiapkan resep',
        errorFallback: 'Dokumen resep tidak dapat dibuat.',
        request: () => medicalRecordsApi.printPrescriptionOrder(record.id),
        onSuccess: () => {
          if (record.prescription_fulfillment_mode === 'print' && (!record.prescription_workflow_status || record.prescription_workflow_status === 'draft')) {
            patchRecord(record.id, (currentRecord) => ({
              ...currentRecord,
              prescription_workflow_status: 'printed',
              prescription_processed_at: new Date().toISOString(),
            }));
          }
        },
      });
    } finally {
      setPrintingPrescriptionOrder(false);
    }
  };

  const printPharmacyTicket = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingPharmacyTicket(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'tiket farmasi',
        preparingMessage: 'Menyiapkan tiket farmasi...',
        errorTitle: 'Gagal menyiapkan tiket farmasi',
        errorFallback: 'Tiket farmasi tidak dapat dibuat.',
        request: () => medicalRecordsApi.printPharmacyTicket(record.id),
      });
    } finally {
      setPrintingPharmacyTicket(false);
    }
  };

  const printLaboratoryTicket = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingLaboratoryTicket(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'tiket laboratorium',
        preparingMessage: 'Menyiapkan tiket laboratorium...',
        errorTitle: 'Gagal menyiapkan tiket laboratorium',
        errorFallback: 'Tiket laboratorium tidak dapat dibuat.',
        request: () => medicalRecordsApi.printLaboratoryOrderTicket(record.id),
      });
    } finally {
      setPrintingLaboratoryTicket(false);
    }
  };

  const printLaboratoryResult = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingLaboratoryResult(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'hasil laboratorium',
        preparingMessage: 'Menyiapkan hasil laboratorium...',
        errorTitle: 'Gagal menyiapkan hasil laboratorium',
        errorFallback: 'Hasil laboratorium tidak dapat dibuat.',
        request: () => medicalRecordsApi.printLaboratoryOrderResult(record.id),
      });
    } finally {
      setPrintingLaboratoryResult(false);
    }
  };

  const printRadiologyTicket = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingRadiologyTicket(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'tiket radiologi',
        preparingMessage: 'Menyiapkan tiket radiologi...',
        errorTitle: 'Gagal menyiapkan tiket radiologi',
        errorFallback: 'Tiket radiologi tidak dapat dibuat.',
        request: () => medicalRecordsApi.printRadiologyOrderTicket(record.id),
      });
    } finally {
      setPrintingRadiologyTicket(false);
    }
  };

  const printRadiologyResult = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingRadiologyResult(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'hasil radiologi',
        preparingMessage: 'Menyiapkan hasil radiologi...',
        errorTitle: 'Gagal menyiapkan hasil radiologi',
        errorFallback: 'Hasil radiologi tidak dapat dibuat.',
        request: () => medicalRecordsApi.printRadiologyOrderResult(record.id),
      });
    } finally {
      setPrintingRadiologyResult(false);
    }
  };

  const printProcedureRecord = async () => {
    const record = selectedRecord;
    if (!record) return;

    setPrintingProcedure(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'cetakan tindakan',
        preparingMessage: 'Menyiapkan cetakan tindakan...',
        errorTitle: 'Gagal menyiapkan cetakan tindakan',
        errorFallback: 'Cetakan tindakan tidak dapat dibuat.',
        request: () => medicalRecordsApi.printProcedureRecord(record.id),
      });
    } finally {
      setPrintingProcedure(false);
    }
  };

  const printMedicalRecordDocument = async ({
    loadingLabel,
    preparingMessage,
    errorTitle,
    errorFallback,
    request,
    onSuccess,
  }: {
    loadingLabel: string;
    preparingMessage: string;
    errorTitle: string;
    errorFallback: string;
    request: () => Promise<any>;
    onSuccess?: () => void;
  }) => {
    await openPdfDocumentInNewWindow({
      toast,
      loadingLabel,
      preparingMessage,
      blockedDescription: `Izinkan popup untuk membuka ${loadingLabel} dari backend.`,
      errorTitle,
      errorFallback,
      request,
      onSuccess,
    });
  };

  const printMedicalResume = async () => {
    if (!visit || printingResumeMedical) return;

    setPrintingResumeMedical(true);
    try {
      await printMedicalRecordDocument({
        loadingLabel: 'resume medis',
        preparingMessage: 'Menyiapkan resume medis...',
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
      await printMedicalRecordDocument({
        loadingLabel: 'surat kontrol',
        preparingMessage: 'Menyiapkan surat kontrol...',
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

  const addAction = async (payload: MedicalActionMutationPayload) => {
    if (!selectedRecord) return false;

    try {
      const response = await medicalRecordsApi.addAction(selectedRecord.id, payload);
      const refreshedRecordResponse = await medicalRecordsApi.getById(selectedRecord.id);
      upsertRecord(refreshedRecordResponse.data.data);
      if (response.data.odontogram_entry) {
        upsertOdontogramEntry(response.data.odontogram_entry);
      }
      return true;
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah tindakan', description: requestError.response?.data?.error });
      return false;
    }
  };

  const updateAction = async (actionId: number, payload: MedicalActionMutationPayload) => {
    if (!selectedRecord) return false;

    try {
      const response = await medicalRecordsApi.updateAction(selectedRecord.id, actionId, payload);
      const refreshedRecordResponse = await medicalRecordsApi.getById(selectedRecord.id);
      upsertRecord(refreshedRecordResponse.data.data);
      if (response.data.odontogram_entry) {
        upsertOdontogramEntry(response.data.odontogram_entry);
      }
      return true;
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal memperbarui tindakan', description: requestError.response?.data?.error });
      return false;
    }
  };

  const addLaboratoryOrderItem = async (payload: { medical_service_id: number; instructions: string }) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addLaboratoryOrderItem(selectedRecord.id, payload);
      upsertRecord(response.data.data);
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah order laboratorium', description: requestError.response?.data?.error });
    }
  };

  const deleteLaboratoryOrderItem = async (itemId: number) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.deleteLaboratoryOrderItem(selectedRecord.id, itemId);
      upsertRecord(response.data.data);
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus item laboratorium', description: requestError.response?.data?.error });
    }
  };

  const submitLaboratoryOrder = async () => {
    if (!selectedRecord) return;

    setSubmittingLaboratoryOrder(true);
    try {
      const updatedRecord = await syncSelectedRecordDraft();
      const response = await medicalRecordsApi.submitLaboratoryOrder((updatedRecord || selectedRecord).id);
      upsertRecord(response.data.data);
      toast({ title: 'Order laboratorium berhasil dikirim ke unit laboratorium' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal mengirim order laboratorium', description: requestError.response?.data?.error });
    } finally {
      setSubmittingLaboratoryOrder(false);
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

  const addRadiologyOrderItem = async (payload: { medical_service_id: number; instructions: string }) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.addRadiologyOrderItem(selectedRecord.id, payload);
      upsertRecord(response.data.data);
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah order radiologi', description: requestError.response?.data?.error });
    }
  };

  const deleteRadiologyOrderItem = async (itemId: number) => {
    if (!selectedRecord) return;

    try {
      const response = await medicalRecordsApi.deleteRadiologyOrderItem(selectedRecord.id, itemId);
      upsertRecord(response.data.data);
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus item radiologi', description: requestError.response?.data?.error });
    }
  };

  const submitRadiologyOrder = async () => {
    if (!selectedRecord) return;

    setSubmittingRadiologyOrder(true);
    try {
      const updatedRecord = await syncSelectedRecordDraft();
      const response = await medicalRecordsApi.submitRadiologyOrder((updatedRecord || selectedRecord).id);
      upsertRecord(response.data.data);
      toast({ title: 'Order radiologi berhasil dikirim ke unit radiologi' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal mengirim order radiologi', description: requestError.response?.data?.error });
    } finally {
      setSubmittingRadiologyOrder(false);
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

  const deleteAction = async (actionId: number) => {
    if (!selectedRecord) return false;

    try {
      await medicalRecordsApi.deleteAction(selectedRecord.id, actionId);
      const refreshedRecordResponse = await medicalRecordsApi.getById(selectedRecord.id);
      upsertRecord(refreshedRecordResponse.data.data);
      return true;
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus tindakan', description: requestError.response?.data?.error });
      return false;
    }
  };

  const updateInformedConsent = async (consentId: number, payload: UpdateInformedConsentPayload) => {
    try {
      const response = await informedConsentsApi.update(consentId, payload);
      const updatedConsent = response.data.data;
      patchRecord(updatedConsent.medical_record_id, (record) => ({
        ...record,
        informed_consents: [updatedConsent, ...(record.informed_consents || []).filter((consent) => consent.id !== updatedConsent.id)],
      }));
      toast({ title: 'Informed consent berhasil disimpan' });
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan informed consent', description: requestError.response?.data?.error });
      throw requestError;
    }
  };

  if (!activeSheetConfig) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="border border-border/70 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Lembar rekam medis tidak valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">Lembar yang diminta tidak dikenali.</p>
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
          <h1 className="text-lg font-semibold">Lembar rekam medis tidak tersedia</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Data kunjungan tidak ditemukan.'}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/emr')}>Kembali ke daftar</Button>
          </div>
        </div>
      </div>
    );
  }

  if (isOdontogramSheet) {
  return (
    <OdontogramSheetPage
      visit={visit}
      entries={odontogramEntries}
      loading={Boolean(loadingOdontogram)}
      error={odontogramError}
      completedSections={completedSections}
      allergyInfo={allergyInfo}
      workspaceLocked={Boolean(workspaceLocked)}
      finalizeBlockers={finalizeVisitBlockers}
      outcomeRecord={latestOutcomeRecord}
      replaceEntries={replaceOdontogramEntries}
      upsertEntry={upsertOdontogramEntry}
      updateVisit={updateVisit}
      onBack={() => navigate(`/emr/${visit.id}`)}
      onFinalizeVisit={(payload) => finalizeVisit(payload, { saveSelectedRecord: false })}
      onPrintControlLetter={printControlLetter}
      showControlLetter={controlLetterAvailable}
      printingControlLetter={printingControlLetter}
      onPrintMedicalResume={printMedicalResume}
      printingMedicalResume={printingResumeMedical}
      onCancelFinalization={cancelFinalization}
      cancelingFinalization={cancelingFinalization}
      prefetchedMonitorResult={latestAutoSyncResult}
      prefetchedMonitorMessage={latestAutoSyncMessage}
    />
  );
  }

  const sheetStatus = getSheetStatus(activeSheetConfig, recordsBySection, Boolean(workspaceLocked));

  if (isInitialAssessmentSheetKey(activeSheetConfig.key) && activeSheetConfig.kind === 'section-editor') {
    return (
      <InitialAssessmentSheetPage
        visit={visit}
        records={records}
        activeSheetConfig={activeSheetConfig}
        recordsBySection={recordsBySection}
        completedSections={completedSections}
        allergyInfo={allergyInfo}
        workspaceLocked={Boolean(workspaceLocked)}
        icd10List={icd10List}
        medicineList={medicineList}
        serviceList={serviceList}
        physicalExamImageList={physicalExamImageList}
        patchRecord={patchRecord}
        replaceRecords={replaceRecords}
        updateVisit={updateVisit}
        onBack={() => navigate(`/emr/${visit.id}`)}
        onFinalizeVisit={(payload) => finalizeVisit(payload, { saveSelectedRecord: false })}
        onPrintControlLetter={printControlLetter}
        showControlLetter={controlLetterAvailable}
        printingControlLetter={printingControlLetter}
        onPrintMedicalResume={printMedicalResume}
        printingMedicalResume={printingResumeMedical}
        onCancelFinalization={cancelFinalization}
        cancelingFinalization={cancelingFinalization}
        prefetchedMonitorResult={latestAutoSyncResult}
        prefetchedMonitorMessage={latestAutoSyncMessage}
      />
    );
  }

  if (activeSheetConfig.kind === 'consent') {
    return (
      <InformedConsentSheetPage
        visit={visit}
        consents={collectVisitInformedConsents(getRecordsForSheetSections(recordsBySection, activeSheetConfig.sections))}
        completedSections={completedSections}
        allergyInfo={allergyInfo}
        workspaceLocked={Boolean(workspaceLocked)}
        finalizeBlockers={finalizeVisitBlockers}
        outcomeRecord={latestOutcomeRecord}
        onBack={() => navigate(`/emr/${visit.id}`)}
        onFinalizeVisit={(payload) => finalizeVisit(payload)}
        onPrintControlLetter={printControlLetter}
        showControlLetter={controlLetterAvailable}
        printingControlLetter={printingControlLetter}
        onUpdateConsent={updateInformedConsent}
        onPrintMedicalResume={printMedicalResume}
        printingMedicalResume={printingResumeMedical}
        onCancelFinalization={cancelFinalization}
        cancelingFinalization={cancelingFinalization}
        prefetchedMonitorResult={latestAutoSyncResult}
        prefetchedMonitorMessage={latestAutoSyncMessage}
      />
    );
  }

  if (activeSheetConfig.kind === 'placeholder') {
    return (
      <div className="flex min-h-0 flex-1 flex-col xl:overflow-hidden">
        <StickyVisitHeader
          visit={visit}
          completedSections={completedSections}
          isLocked={Boolean(workspaceLocked)}
          sticky
          sectionLabel={activeSheetConfig.label}
          allergyInfo={allergyInfo}
          onBack={() => navigate(`/emr/${visit.id}`)}
          onEncounterSynced={reload}
          prefetchedMonitorResult={latestAutoSyncResult}
          prefetchedMonitorMessage={latestAutoSyncMessage}
          statusNote={<span className="font-medium text-muted-foreground">{sheetStatus.label}</span>}
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

        <div className="px-4 py-4 lg:px-5">
          <SheetPlaceholder sheet={activeSheetConfig} visit={visit} recordsBySection={recordsBySection} />
        </div>

        <FinalizeVisitDialog
          open={finalizeOpen}
          onOpenChange={setFinalizeOpen}
          outcomeRecord={latestOutcomeRecord}
          blockers={finalizeVisitBlockers}
          submitting={finalizing}
          onSubmit={(payload) => finalizeVisit(payload)}
        />
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
        sectionLabel={activeSheetConfig.label}
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
          <span className="text-muted-foreground">{sheetStatus.label}</span>
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
        <div className="grid gap-0 border border-border/70 bg-background xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
          <aside className="border-b border-border/70 bg-background xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:border-b-0 xl:border-r xl:border-r-border/70">
            <div className="border-b border-border/70 px-3 py-3">
              <h2 className="text-sm font-semibold">{activeSheetConfig.label}</h2>
              {activeSheetConfig.helper && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{activeSheetConfig.helper}</p>
              )}

              {activeSheetConfig.kind === 'section-editor' && (
                <div className="mt-3 space-y-1.5">
                  {activeSheetConfig.sections.map((section) => {
                    const config = getSectionConfig(section);
                    const sectionStatus = getSectionRowStatus(section, recordsBySection[section] || [], Boolean(workspaceLocked));

                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        className={cn(
                          'flex w-full items-center justify-between border border-border/70 px-2.5 py-2 text-left transition hover:bg-muted/20',
                          activeSection === section && 'bg-muted/20'
                        )}
                      >
                        <div>
                          <p className="text-[12px] font-medium">{config.label}</p>
                          <p className="text-[10px] text-muted-foreground">{(recordsBySection[section] || []).length} entri</p>
                        </div>
                        <SectionStatusBadge label={sectionStatus.label} tone={sectionStatus.tone} />
                      </button>
                    );
                  })}
                </div>
              )}

              {!workspaceLocked && editableSection && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={createEntry} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    Tambah Entri
                  </Button>
                  <Button
                    className="gap-1.5 rounded-none shadow-none"
                    onClick={
                      primaryActionMode === 'prescription-submit'
                        ? saveAndSubmitPrescriptionOrder
                        : primaryActionMode === 'laboratory-submit'
                          ? submitLaboratoryOrder
                          : primaryActionMode === 'radiology-submit'
                            ? submitRadiologyOrder
                            : saveSelectedRecord
                    }
                    disabled={
                      !selectedRecord
                      || readOnly
                      || (primaryActionMode === 'prescription-submit'
                        ? (submittingPrescriptionOrder || prescriptionItemCount === 0)
                        : primaryActionMode === 'laboratory-submit'
                          ? (submittingLaboratoryOrder || laboratoryItemCount === 0)
                          : primaryActionMode === 'radiology-submit'
                            ? (submittingRadiologyOrder || radiologyItemCount === 0)
                            : saving)
                    }
                  >
                    {primaryActionMode === 'prescription-submit' || primaryActionMode === 'laboratory-submit' || primaryActionMode === 'radiology-submit'
                      ? ((primaryActionMode === 'prescription-submit' && submittingPrescriptionOrder)
                        || (primaryActionMode === 'laboratory-submit' && submittingLaboratoryOrder)
                        || (primaryActionMode === 'radiology-submit' && submittingRadiologyOrder)
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" />)
                      : (saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />)}
                    {primaryActionMode === 'prescription-submit' || primaryActionMode === 'laboratory-submit' || primaryActionMode === 'radiology-submit' ? 'Kirim' : 'Simpan Entri'}
                  </Button>
                </div>
              )}
            </div>

            {editableSection && (
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
            )}
          </aside>

          <main className="min-w-0 bg-background xl:h-full xl:min-h-0 xl:overflow-hidden">
            <div className="px-3 py-3 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:[scrollbar-gutter:stable]">
              {activeSheetConfig.kind === 'resume' ? (
                <ResumeSheetView
                  editor={selectedRecord ? (
                    <SectionEditorBody
                      section="outcome"
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
                      onAddPrescriptionCompound={addPrescriptionCompound}
                      onDeletePrescriptionCompound={deletePrescriptionCompound}
                      onSubmitPrescriptionOrder={submitPrescriptionOrder}
                      onCancelPrescriptionOrder={cancelPrescriptionOrder}
                      onPrintPrescriptionOrder={printPrescriptionOrder}
                      onPrintPrescriptionTicket={printPharmacyTicket}
                      canCancelPrescriptionOrder={canCancelPrescriptionOrder}
                      prescriptionActionState={{
                        submitting: submittingPrescriptionOrder,
                        canceling: cancelingPrescriptionOrder,
                        printingPrescription: printingPrescriptionOrder,
                        printingTicket: printingPharmacyTicket,
                      }}
                      onAddLaboratoryOrderItem={addLaboratoryOrderItem}
                      onDeleteLaboratoryOrderItem={deleteLaboratoryOrderItem}
                      onCancelLaboratoryOrder={cancelLaboratoryOrder}
                      onPrintLaboratoryTicket={printLaboratoryTicket}
                      onPrintLaboratoryResult={printLaboratoryResult}
                      canCancelLaboratoryOrder={canCancelLaboratoryOrder}
                      laboratoryActionState={{
                        canceling: cancelingLaboratoryOrder,
                        printingTicket: printingLaboratoryTicket,
                        printingResult: printingLaboratoryResult,
                      }}
                      onAddRadiologyOrderItem={addRadiologyOrderItem}
                      onDeleteRadiologyOrderItem={deleteRadiologyOrderItem}
                      onCancelRadiologyOrder={cancelRadiologyOrder}
                      onPrintRadiologyTicket={printRadiologyTicket}
                      onPrintRadiologyResult={printRadiologyResult}
                      canCancelRadiologyOrder={canCancelRadiologyOrder}
                      radiologyActionState={{
                        canceling: cancelingRadiologyOrder,
                        printingTicket: printingRadiologyTicket,
                        printingResult: printingRadiologyResult,
                      }}
                      onAddAction={addAction}
                      onUpdateAction={updateAction}
                      onDeleteAction={deleteAction}
                      onPrintProcedure={printProcedureRecord}
                      procedureActionState={{
                        printing: printingProcedure,
                      }}
                      odontogramEntries={odontogramEntries}
                      readOnly={readOnly}
                    />
                  ) : (
                    <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                      Belum ada entri outcome. Buat entri baru untuk mulai menyiapkan resume medis.
                    </section>
                  )}
                />
              ) : activeSheetConfig.kind === 'section-editor' ? (
                <div className="space-y-4">
                  {editorSections.map((section) => {
                    const sectionConfig = getSectionConfig(section);
                    const sectionRecords = recordsBySection[section] || [];
                    const sectionRecord = visibleSectionRecords[section] || null;
                    const sectionStatus = getSectionRowStatus(section, sectionRecords, Boolean(workspaceLocked));
                    const isActiveSection = section === activeSection;

                    return (
                      <section
                        key={section}
                        className={cn(
                          'border border-border/70 bg-background',
                          isActiveSection && 'border-foreground/20'
                        )}
                      >
                        <div className={cn('border-b border-border/70 px-3 py-2.5', isActiveSection && 'bg-muted/20')}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-[13px] font-semibold tracking-tight">{sectionConfig.label}</h3>
                                <SectionStatusBadge label={sectionStatus.label} tone={sectionStatus.tone} />
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {sectionRecords.length > 0
                                  ? `${sectionRecords.length} entri tercatat`
                                  : 'Belum ada entri'}
                              </p>
                            </div>

                            {!isActiveSection && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-none shadow-none"
                                onClick={() => setActiveSection(section)}
                              >
                                Fokuskan
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="p-3">
                          {sectionRecord ? (
                            <SectionEditorBody
                              section={section}
                              draft={isActiveSection ? draft : buildDraft(sectionRecord, visit)}
                              setDraft={isActiveSection ? setDraft : readOnlySetDraft}
                              record={sectionRecord}
                              icd10List={icd10List}
                              medicineList={medicineList}
                              serviceList={serviceList}
                              physicalExamImageList={physicalExamImageList}
                              onAddDiagnosis={addDiagnosis}
                              onDeleteDiagnosis={deleteDiagnosis}
                              onAddPrescription={addPrescription}
                              onDeletePrescription={deletePrescription}
                              onAddPrescriptionCompound={isActiveSection ? addPrescriptionCompound : undefined}
                              onDeletePrescriptionCompound={isActiveSection ? deletePrescriptionCompound : undefined}
                              onSubmitPrescriptionOrder={isActiveSection ? submitPrescriptionOrder : undefined}
                              onCancelPrescriptionOrder={isActiveSection ? cancelPrescriptionOrder : undefined}
                              onPrintPrescriptionOrder={isActiveSection ? printPrescriptionOrder : undefined}
                              onPrintPrescriptionTicket={isActiveSection ? printPharmacyTicket : undefined}
                              canCancelPrescriptionOrder={isActiveSection ? canCancelPrescriptionOrder : false}
                              prescriptionActionState={isActiveSection ? {
                                submitting: submittingPrescriptionOrder,
                                canceling: cancelingPrescriptionOrder,
                                printingPrescription: printingPrescriptionOrder,
                                printingTicket: printingPharmacyTicket,
                              } : undefined}
                              onAddLaboratoryOrderItem={addLaboratoryOrderItem}
                              onDeleteLaboratoryOrderItem={deleteLaboratoryOrderItem}
                              onCancelLaboratoryOrder={isActiveSection ? cancelLaboratoryOrder : undefined}
                              onPrintLaboratoryTicket={isActiveSection ? printLaboratoryTicket : undefined}
                              onPrintLaboratoryResult={isActiveSection ? printLaboratoryResult : undefined}
                              canCancelLaboratoryOrder={isActiveSection ? canCancelLaboratoryOrder : false}
                              laboratoryActionState={isActiveSection ? {
                                canceling: cancelingLaboratoryOrder,
                                printingTicket: printingLaboratoryTicket,
                                printingResult: printingLaboratoryResult,
                              } : undefined}
                              onAddRadiologyOrderItem={addRadiologyOrderItem}
                              onDeleteRadiologyOrderItem={deleteRadiologyOrderItem}
                              onCancelRadiologyOrder={isActiveSection ? cancelRadiologyOrder : undefined}
                              onPrintRadiologyTicket={isActiveSection ? printRadiologyTicket : undefined}
                              onPrintRadiologyResult={isActiveSection ? printRadiologyResult : undefined}
                              canCancelRadiologyOrder={isActiveSection ? canCancelRadiologyOrder : false}
                              radiologyActionState={isActiveSection ? {
                                canceling: cancelingRadiologyOrder,
                                printingTicket: printingRadiologyTicket,
                                printingResult: printingRadiologyResult,
                              } : undefined}
                              onAddAction={addAction}
                              onUpdateAction={updateAction}
                              onDeleteAction={deleteAction}
                              onPrintProcedure={isActiveSection ? printProcedureRecord : undefined}
                              procedureActionState={isActiveSection ? {
                                printing: printingProcedure,
                              } : undefined}
                              odontogramEntries={odontogramEntries}
                              readOnly={isActiveSection ? readOnly : true}
                            />
                          ) : (
                            <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                              Belum ada entri {sectionConfig.label.toLowerCase()}. Pilih bagian ini di panel kiri lalu buat entri baru.
                            </section>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <section className="border-t border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                  Belum ada entri pada bagian ini. Buat entri baru untuk mulai mencatat.
                </section>
              )}
            </div>
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
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
          if (!open) setDeleteTarget(null);
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
        onSubmit={(payload) => finalizeVisit(payload)}
      />
    </div>
  );
}