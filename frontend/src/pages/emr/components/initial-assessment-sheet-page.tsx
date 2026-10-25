import { useEffect, useMemo, useState, type SetStateAction } from 'react';
import { FilePlus2, Loader2, Lock, Save } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  type FinalizeVisitPayload,
  medicalRecordsApi,
  type ICD10,
  type MedicalRecord,
  type MedicalRecordSectionType,
  type MedicalService,
  type Medicine,
  type PhysicalExamImageMaster,
  type SatusehatVisitAutoSyncResult,
  type Visit,
} from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';
import { SURAT_TYPE_OPTIONS, getInitialAssessmentEntryFilter, getSectionConfig } from '../constants';
import type { MedicalRecordDraft } from '../types';
import type { MedicalSheetConfig } from '../types';
import { buildDraft, buildSheetEntryGroups, getFinalizeVisitBlockingOrders, getSectionRowStatus, getSheetEntryGroupStatus, type MedicalSheetEntryGroup } from '../utils';
import { FinalizeVisitDialog } from './finalize-visit-dialog';
import { FinalizedVisitActions } from './finalized-visit-actions';
import { SectionEditorBody } from './section-editor-body';
import { SectionStatusBadge } from './section-status-badge';
import { StickyVisitHeader } from './sticky-visit-header';
import { InitialAssessmentEntryTimeline } from './initial-assessment-entry-timeline';

type InitialAssessmentSheetPageProps = {
  visit: Visit;
  records: MedicalRecord[];
  activeSheetConfig: MedicalSheetConfig;
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>;
  completedSections: number;
  allergyInfo: string;
  workspaceLocked: boolean;
  icd10List: ICD10[];
  medicineList: Medicine[];
  serviceList: MedicalService[];
  physicalExamImageList: PhysicalExamImageMaster[];
  patchRecord: (recordId: number, updater: (record: MedicalRecord) => MedicalRecord) => void;
  replaceRecords: (updater: (currentRecords: MedicalRecord[]) => MedicalRecord[]) => void;
  updateVisit: (updater: (currentVisit: Visit | null) => Visit | null) => void;
  onBack: () => void;
  onFinalizeVisit: (payload: FinalizeVisitPayload) => Promise<void>;
  onPrintControlLetter: () => Promise<void>;
  showControlLetter: boolean;
  printingControlLetter: boolean;
  onPrintMedicalResume: () => Promise<void>;
  printingMedicalResume: boolean;
  onCancelFinalization: () => Promise<void>;
  cancelingFinalization: boolean;
  prefetchedMonitorResult?: SatusehatVisitAutoSyncResult | null;
  prefetchedMonitorMessage?: string;
};

type DraftState = Partial<Record<MedicalRecordSectionType, MedicalRecordDraft>>;

const NOOP_ADD_PRESCRIPTION = () => undefined;
const NOOP_DELETE_PRESCRIPTION = () => undefined;
const NOOP_ADD_ACTION = () => undefined;
const NOOP_DELETE_ACTION = () => undefined;

export function InitialAssessmentSheetPage({
  visit,
  records,
  activeSheetConfig,
  recordsBySection,
  completedSections,
  allergyInfo,
  workspaceLocked,
  icd10List,
  medicineList,
  serviceList,
  physicalExamImageList,
  patchRecord,
  replaceRecords,
  updateVisit,
  onBack,
  onFinalizeVisit,
  onPrintControlLetter,
  showControlLetter,
  printingControlLetter,
  onPrintMedicalResume,
  printingMedicalResume,
  onCancelFinalization,
  cancelingFinalization,
  prefetchedMonitorResult,
  prefetchedMonitorMessage,
}: InitialAssessmentSheetPageProps) {
  const { toast } = useToast();
  const initialAssessmentFilter = getInitialAssessmentEntryFilter(activeSheetConfig.key);
  const isSuratSheet = activeSheetConfig.key === 'surat';
  const entryLabel = activeSheetConfig.label;
  const entryLabelLower = entryLabel.toLowerCase();
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<MedicalRecordSectionType>(activeSheetConfig.defaultSection || 'anamnesis');
  const [drafts, setDrafts] = useState<DraftState>({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printingEntryKey, setPrintingEntryKey] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MedicalSheetEntryGroup | null>(null);
  const [cancelingEntry, setCancelingEntry] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MedicalSheetEntryGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [selectedSuratTypePrefix, setSelectedSuratTypePrefix] = useState<string>(SURAT_TYPE_OPTIONS[0]?.value || 'surat-sakit');

  const entryGroups = useMemo(
    () => buildSheetEntryGroups(recordsBySection, activeSheetConfig.sections, initialAssessmentFilter || undefined),
    [activeSheetConfig.sections, initialAssessmentFilter, recordsBySection]
  );
  const outcomeRecord = recordsBySection.outcome?.[0] || null;
  const finalizeVisitBlockers = useMemo(() => getFinalizeVisitBlockingOrders(recordsBySection), [recordsBySection]);
  const controlWhatsAppPayload = useMemo(
    () => createControlScheduleWhatsAppPayloadFromVisit(visit, outcomeRecord),
    [outcomeRecord, visit]
  );

  const selectedEntry = useMemo(
    () => entryGroups.find((entry) => entry.key === selectedEntryKey) || entryGroups[0] || null,
    [entryGroups, selectedEntryKey]
  );

  const selectedEntrySignature = useMemo(
    () => activeSheetConfig.sections.map((section) => selectedEntry?.records[section]?.id || 0).join('|'),
    [activeSheetConfig.sections, selectedEntry]
  );

  useEffect(() => {
    if (!selectedEntry) {
      setSelectedEntryKey(null);
      return;
    }

    if (selectedEntry.key !== selectedEntryKey) {
      setSelectedEntryKey(selectedEntry.key);
    }
  }, [selectedEntry, selectedEntryKey]);

  useEffect(() => {
    if (!selectedEntry) {
      setDrafts({});
      return;
    }

    const nextDrafts = activeSheetConfig.sections.reduce((result, section) => {
      const record = selectedEntry.records[section];
      if (record) {
        result[section] = buildDraft(record, visit);
      }
      return result;
    }, {} as DraftState);

    setDrafts(nextDrafts);
  }, [activeSheetConfig.sections, selectedEntry?.key, selectedEntrySignature, visit?.id]);

  useEffect(() => {
    if (!isSuratSheet) {
      return;
    }
    setSelectedSuratTypePrefix(SURAT_TYPE_OPTIONS[0]?.value || 'surat-sakit');
  }, [isSuratSheet, activeSheetConfig.key]);

  const getSectionRecord = (section: MedicalRecordSectionType) => selectedEntry?.records[section] || null;

  const getSectionDisplayLabel = (section: MedicalRecordSectionType) => {
    if (!isSuratSheet) {
      return getSectionConfig(section).label;
    }

    if (section === 'assessment') {
      return 'Pertimbangan Surat';
    }

    if (section === 'outcome') {
      return 'Keterangan Surat';
    }

    return getSectionConfig(section).label;
  };

  const getSectionDraft = (section: MedicalRecordSectionType) => {
    const record = getSectionRecord(section) || undefined;
    return drafts[section] || buildDraft(record, visit);
  };

  const setSectionDraft = (section: MedicalRecordSectionType, updater: SetStateAction<MedicalRecordDraft>) => {
    setDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[section] || buildDraft(getSectionRecord(section) || undefined, visit);
      const nextDraft = typeof updater === 'function'
        ? (updater as (previousDraft: MedicalRecordDraft) => MedicalRecordDraft)(currentDraft)
        : updater;

      return {
        ...currentDrafts,
        [section]: nextDraft,
      };
    });
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedEntry) return false;

    return activeSheetConfig.sections.some((section) => {
      const record = selectedEntry.records[section];
      if (!record) return false;
      return JSON.stringify(getSectionDraft(section)) !== JSON.stringify(buildDraft(record, visit));
    });
  }, [activeSheetConfig.sections, drafts, selectedEntry, visit]);

  const packageStatus = useMemo(
    () => selectedEntry ? getSheetEntryGroupStatus(selectedEntry, activeSheetConfig.sections, Boolean(workspaceLocked)) : null,
    [activeSheetConfig.sections, selectedEntry, workspaceLocked]
  );

  const assessmentRecord = getSectionRecord('assessment');

  const createEntry = async () => {
    setCreating(true);
    try {
      const response = await medicalRecordsApi.createInitialAssessmentEntry(visit.id, {
        sheetKey: initialAssessmentFilter?.sheetKey,
        entryGroupPrefix: isSuratSheet ? selectedSuratTypePrefix : initialAssessmentFilter?.entryGroupPrefix,
      });
      const createdRecords: MedicalRecord[] = response.data.data || [];
      replaceRecords((currentRecords) => [
        ...createdRecords,
        ...currentRecords.filter((record) => !createdRecords.some((createdRecord) => createdRecord.id === record.id)),
      ]);
      setSelectedEntryKey(createdRecords[0]?.entry_group_key || null);
      setActiveSection(activeSheetConfig.defaultSection || 'anamnesis');
      updateVisit((currentVisit) => currentVisit
        ? { ...currentVisit, status: 'in_progress', queue_status: 'in_consultation' }
        : currentVisit
      );
      toast({ title: `Entri ${entryLabelLower} berhasil dibuat` });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: `Gagal membuat entri ${entryLabelLower}`,
        description: requestError.response?.data?.error,
      });
    } finally {
      setCreating(false);
    }
  };

  const saveEntry = async () => {
    if (!selectedEntry) return false;

    setSaving(true);
    try {
      const updatedRecords: MedicalRecord[] = [];

      for (const section of activeSheetConfig.sections) {
        const record = selectedEntry.records[section];
        if (!record) continue;

        const response = await medicalRecordsApi.update(record.id, getSectionDraft(section));
        updatedRecords.push(response.data.data);
      }

      replaceRecords((currentRecords) => [
        ...updatedRecords,
        ...currentRecords.filter((record) => !updatedRecords.some((updatedRecord) => updatedRecord.id === record.id)),
      ]);

      const anamnesisDraft = getSectionDraft('anamnesis');
      if (anamnesisDraft.allergy_notes.trim()) {
        updateVisit((currentVisit) => currentVisit ? {
          ...currentVisit,
          patient: currentVisit.patient
            ? { ...currentVisit.patient, allergies: anamnesisDraft.allergy_notes.trim() }
            : currentVisit.patient,
        } : currentVisit);
      }

      toast({ title: `Entri ${entryLabelLower} berhasil disimpan` });
      return true;
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: `Gagal menyimpan entri ${entryLabelLower}`,
        description: requestError.response?.data?.error,
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const recordIdsToDelete = records
        .filter((record) => (record.entry_group_key || '').trim() === deleteTarget.key)
        .map((record) => record.id);
      const deleteIds = recordIdsToDelete.length > 0 ? recordIdsToDelete : deleteTarget.recordIds;

      for (const recordId of deleteIds) {
        await medicalRecordsApi.delete(recordId);
      }

      replaceRecords((currentRecords) => currentRecords.filter((record) => !deleteIds.includes(record.id)));
      setDeleteTarget(null);
      setDrafts({});
      toast({ title: `Entri ${entryLabelLower} berhasil dihapus` });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: `Gagal menghapus entri ${entryLabelLower}`,
        description: requestError.response?.data?.error,
      });
    } finally {
      setDeleting(false);
    }
  };

  const cancelEntry = async () => {
    if (!cancelTarget) return;

    setCancelingEntry(true);
    try {
      const recordIds = records
        .filter((record) => (record.entry_group_key || '').trim() === cancelTarget.key)
        .map((record) => record.id);
      const cancelIds = recordIds.length > 0 ? recordIds : cancelTarget.recordIds;
      const updatedRecords: MedicalRecord[] = [];

      for (const recordId of cancelIds) {
        const response = await medicalRecordsApi.cancel(recordId);
        updatedRecords.push(response.data.data);
      }

      replaceRecords((currentRecords) => [
        ...updatedRecords,
        ...currentRecords.filter((record) => !updatedRecords.some((updatedRecord) => updatedRecord.id === record.id)),
      ]);
      setCancelTarget(null);
      setDrafts({});
      toast({ title: `Entri ${entryLabelLower} berhasil dibatalkan` });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: `Gagal membatalkan entri ${entryLabelLower}`,
        description: requestError.response?.data?.error,
      });
    } finally {
      setCancelingEntry(false);
    }
  };

  const finalizeEntryVisit = async (payload: FinalizeVisitPayload) => {
    setFinalizing(true);
    try {
      if (hasUnsavedChanges) {
        const saved = await saveEntry();
        if (!saved) return;
      }

      await onFinalizeVisit(payload);
      setFinalizeOpen(false);
    } finally {
      setFinalizing(false);
    }
  };

  const addDiagnosis = async (payload: { icd10_id: number; diagnosis_type: 'primer' | 'sekunder'; working_diagnosis: string; differential_diagnosis: string; assessment_narrative: string; notes: string }) => {
    if (!assessmentRecord) return;

    try {
      const response = await medicalRecordsApi.addDiagnosis(assessmentRecord.id, payload);
      patchRecord(assessmentRecord.id, (record) => ({
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

      setSectionDraft('assessment', (currentDraft) => ({
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
    if (!assessmentRecord) return;

    try {
      await medicalRecordsApi.deleteDiagnosis(assessmentRecord.id, diagnosisId);
      patchRecord(assessmentRecord.id, (record) => ({
        ...record,
        diagnoses: (record.diagnoses || []).filter((diagnosis) => diagnosis.id !== diagnosisId),
      }));
    } catch (requestError: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus diagnosis', description: requestError.response?.data?.error });
    }
  };

  const printEntry = async (entry: MedicalSheetEntryGroup) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        variant: 'destructive',
        title: 'Jendela cetak diblokir',
        description: 'Izinkan popup untuk membuka dokumen cetak dari backend.',
      });
      return;
    }

    printWindow.document.write('<html><head><title>Menyiapkan cetakan...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan dokumen cetak...</body></html>');
    printWindow.document.close();

    setPrintingEntryKey(entry.key);
    try {
      const response = isSuratSheet
        ? await medicalRecordsApi.printSuratEntry(visit.id, {
          entryGroupKey: entry.key.startsWith('legacy-') ? undefined : entry.key,
          recordIds: entry.recordIds,
          autoPrint: true,
        })
        : await medicalRecordsApi.printInitialAssessmentEntry(visit.id, {
          entryGroupKey: entry.key.startsWith('legacy-') ? undefined : entry.key,
          recordIds: entry.recordIds,
          sheetKey: initialAssessmentFilter?.sheetKey,
          autoPrint: true,
        });

      const contentType = response.headers['content-type'] || 'text/html';
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);

      printWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (requestError: any) {
      printWindow.close();
      toast({
        variant: 'destructive',
        title: 'Gagal menyiapkan cetakan',
        description: requestError.response?.data?.error || `Dokumen cetak ${entryLabelLower} tidak dapat dibuat.`,
      });
    } finally {
      setPrintingEntryKey(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:overflow-hidden">
      <StickyVisitHeader
        visit={visit}
        completedSections={completedSections}
        isLocked={Boolean(workspaceLocked)}
        sticky
        sectionLabel={activeSheetConfig.label}
        allergyInfo={allergyInfo}
        onBack={onBack}
        prefetchedMonitorResult={prefetchedMonitorResult}
        prefetchedMonitorMessage={prefetchedMonitorMessage}
        statusNote={selectedEntry ? (
          <span className={hasUnsavedChanges ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
            {hasUnsavedChanges ? 'Perubahan entri belum disimpan' : packageStatus?.label || 'Entri siap'}
          </span>
        ) : (
          <span className="text-muted-foreground">Belum ada entri {entryLabelLower}</span>
        )}
        actions={!workspaceLocked ? (
          <Button className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" onClick={() => setFinalizeOpen(true)} title='Final Kunjungan'>
            <Lock className="h-4 w-4" />
          </Button>
        ) : visit.status === 'completed' ? (
          <FinalizedVisitActions
            visitId={visit.id}
            showControlLetter={showControlLetter}
            controlWhatsAppPayload={controlWhatsAppPayload}
            onPrintControlLetter={onPrintControlLetter}
            printingControlLetter={printingControlLetter}
            onPrintMedicalResume={onPrintMedicalResume}
            printingMedicalResume={printingMedicalResume}
            onCancelFinalization={onCancelFinalization}
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

              <div className="mt-2.5 space-y-1.5">
                {activeSheetConfig.sections.map((section) => {
                  const sectionRecord = getSectionRecord(section);
                  const sectionStatus = getSectionRowStatus(section, sectionRecord ? [sectionRecord] : [], Boolean(workspaceLocked));
                  const sectionLabel = getSectionDisplayLabel(section);

                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => {
                        setActiveSection(section);
                        document.getElementById(`initial-assessment-section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={cn(
                        'flex w-full items-center justify-between border border-border/70 px-2.5 py-2 text-left transition hover:bg-muted/20',
                        activeSection === section && 'bg-muted/20'
                      )}
                    >
                      <div>
                        <p className="text-[12px] font-medium">{sectionLabel}</p>
                      </div>
                      <SectionStatusBadge label={sectionStatus.label} tone={sectionStatus.tone} />
                    </button>
                  );
                })}
              </div>

              {!workspaceLocked && isSuratSheet && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-medium">Jenis surat untuk entri baru</p>
                  <Select value={selectedSuratTypePrefix} onValueChange={setSelectedSuratTypePrefix}>
                    <SelectTrigger className="h-9 rounded-none">
                      <SelectValue placeholder="Pilih jenis surat" />
                    </SelectTrigger>
                    <SelectContent>
                      {SURAT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!workspaceLocked && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={createEntry} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    Tambah Entri
                  </Button>
                  <Button className="gap-1.5 rounded-none shadow-none" onClick={saveEntry} disabled={!selectedEntry || saving || !hasUnsavedChanges}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Entri
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-background xl:min-h-0 xl:flex-1 xl:overflow-hidden">
              <InitialAssessmentEntryTimeline
                entries={entryGroups}
                sections={activeSheetConfig.sections}
                visitLocked={Boolean(workspaceLocked)}
                selectedEntryKey={selectedEntry?.key || null}
                dirtyEntryKey={hasUnsavedChanges ? selectedEntry?.key || null : null}
                printingEntryKey={printingEntryKey}
                emptyStateLabel={`Belum ada entri ${entryLabelLower}.`}
                emptySummaryLabel={`${entryLabelLower} belum diisi`}
                onSelect={setSelectedEntryKey}
                onPrintEntry={printEntry}
                onCancelEntry={!workspaceLocked ? setCancelTarget : undefined}
                onDeleteEntry={!workspaceLocked ? setDeleteTarget : undefined}
              />
            </div>
          </aside>

          <main className="min-w-0 bg-background xl:h-full xl:min-h-0 xl:overflow-hidden">
            <div className="space-y-4 px-3 py-3 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:[scrollbar-gutter:stable]">
              {selectedEntry ? activeSheetConfig.sections.map((section) => {
                const record = getSectionRecord(section);
                const sectionStatus = getSectionRowStatus(section, record ? [record] : [], Boolean(workspaceLocked));
                const sectionLabel = getSectionDisplayLabel(section);

                return (
                  <section
                    key={section}
                    id={`initial-assessment-section-${section}`}
                    className={cn('border border-border/70 bg-background', activeSection === section && 'border-foreground/20')}
                  >
                    <div className={cn('border-b border-border/70 px-3 py-2.5', activeSection === section && 'bg-muted/20')}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-semibold tracking-tight">{sectionLabel}</h3>
                            <SectionStatusBadge label={sectionStatus.label} tone={sectionStatus.tone} />
                          </div>
                          {!record && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Bagian ini belum tersedia pada entri {entryLabelLower} ini.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-3">
                      {record ? (
                        <SectionEditorBody
                          section={section}
                          variant={
                            activeSheetConfig.key === 'pengkajian-awal-gigi'
                              ? 'dental'
                              : activeSheetConfig.key === 'surat'
                                ? 'surat'
                                : 'default'
                          }
                          draft={getSectionDraft(section)}
                          setDraft={(updater) => setSectionDraft(section, updater)}
                          record={record}
                          allRecords={records}
                          icd10List={icd10List}
                          medicineList={medicineList}
                          serviceList={serviceList}
                          physicalExamImageList={physicalExamImageList}
                          onAddDiagnosis={addDiagnosis}
                          onDeleteDiagnosis={deleteDiagnosis}
                          onAddPrescription={NOOP_ADD_PRESCRIPTION}
                          onDeletePrescription={NOOP_DELETE_PRESCRIPTION}
                          onAddAction={NOOP_ADD_ACTION}
                          onDeleteAction={NOOP_DELETE_ACTION}
                          readOnly={Boolean(workspaceLocked || record.status === 'final' || record.status === 'cancelled')}
                        />
                      ) : (
                        <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                          Bagian ini belum tersedia pada entri {entryLabelLower} lama.
                        </section>
                      )}
                    </div>
                  </section>
                );
              }) : (
                <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
                  Belum ada entri {entryLabelLower}. Buat entri baru untuk mulai mencatat.
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
        onConfirm={cancelEntry}
        title={`Batalkan Entri ${entryLabel}`}
        description={`Seluruh bagian dalam entri ${entryLabelLower} ini akan ditandai batal sebelum nantinya bisa dihapus.`}
        confirmText={cancelingEntry ? 'Membatalkan...' : 'Batalkan Entri'}
        cancelText="Tutup"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteEntry}
        title={`Hapus Entri ${entryLabel}`}
        description={`Hanya entri ${entryLabelLower} berstatus batal yang dapat dihapus, dan seluruh bagiannya akan ikut terhapus permanen.`}
        confirmText={deleting ? 'Menghapus...' : 'Hapus'}
        cancelText="Batal"
        variant="destructive"
      />

      <FinalizeVisitDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        outcomeRecord={outcomeRecord}
        blockers={finalizeVisitBlockers}
        submitting={finalizing}
        onSubmit={finalizeEntryVisit}
      />
    </div>
  );
}