import { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Printer, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { informedConsentsApi, type FinalizeVisitPayload, type MedicalRecord, type SatusehatVisitAutoSyncResult, type UpdateInformedConsentPayload, type Visit } from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatDateTimeLocal, type VisitInformedConsent } from '../utils';
import { FinalizeVisitDialog } from './finalize-visit-dialog';
import { FinalizedVisitActions } from './finalized-visit-actions';
import { PAPER_INPUT_CLASSNAME, PAPER_SELECT_TRIGGER_CLASSNAME, TableCell, TableRow, TableSection, TextEditor } from './form-fields';
import { StickyVisitHeader } from './sticky-visit-header';

type InformedConsentSheetPageProps = {
  visit: Visit;
  consents: VisitInformedConsent[];
  completedSections: number;
  allergyInfo: string;
  workspaceLocked: boolean;
  finalizeBlockers: string[];
  outcomeRecord: MedicalRecord | null;
  onBack: () => void;
  onFinalizeVisit: (payload: FinalizeVisitPayload) => Promise<void>;
  onPrintControlLetter: () => Promise<void>;
  showControlLetter: boolean;
  printingControlLetter: boolean;
  onUpdateConsent: (consentId: number, payload: UpdateInformedConsentPayload) => Promise<void>;
  onPrintMedicalResume: () => Promise<void>;
  printingMedicalResume: boolean;
  onCancelFinalization: () => Promise<void>;
  cancelingFinalization: boolean;
  prefetchedMonitorResult?: SatusehatVisitAutoSyncResult | null;
  prefetchedMonitorMessage?: string;
};

const DECISION_OPTIONS = [
  { value: 'pending', label: 'Pending / Draft otomatis' },
  { value: 'approved', label: 'Disetujui pasien' },
  { value: 'declined', label: 'Ditolak pasien' },
];

function buildConsentDraft(consent: VisitInformedConsent | null | undefined, visit: Visit): UpdateInformedConsentPayload {
  return {
    action_description: consent?.action_description || '',
    risks: consent?.risks || '',
    benefits: consent?.benefits || '',
    patient_decision: consent?.patient_decision || 'pending',
    consent_date: formatDateTimeLocal(consent?.consent_date),
    consent_giver_name: consent?.consent_giver_name || visit.patient?.full_name || '',
    consent_giver_relation: consent?.consent_giver_relation || 'Pasien sendiri',
    consent_giver_id_number: consent?.consent_giver_id_number || visit.patient?.nik || '',
    witness_name: consent?.witness_name || '',
    notes: consent?.notes || '',
  };
}

function getDecisionBadge(decision?: string) {
  switch ((decision || '').toLowerCase()) {
    case 'approved':
      return { label: 'Disetujui', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' };
    case 'declined':
      return { label: 'Ditolak', className: 'border-rose-300 bg-rose-50 text-rose-700' };
    default:
      return { label: 'Draft otomatis', className: 'border-amber-300 bg-amber-50 text-amber-700' };
  }
}

export function InformedConsentSheetPage({
  visit,
  consents,
  completedSections,
  allergyInfo,
  workspaceLocked,
  finalizeBlockers,
  outcomeRecord,
  onBack,
  onFinalizeVisit,
  onPrintControlLetter,
  showControlLetter,
  printingControlLetter,
  onUpdateConsent,
  onPrintMedicalResume,
  printingMedicalResume,
  onCancelFinalization,
  cancelingFinalization,
  prefetchedMonitorResult,
  prefetchedMonitorMessage,
}: InformedConsentSheetPageProps) {
  const { toast } = useToast();
  const [selectedConsentId, setSelectedConsentId] = useState<number | null>(null);
  const [draft, setDraft] = useState<UpdateInformedConsentPayload>(() => buildConsentDraft(undefined, visit));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const selectedConsent = useMemo(
    () => consents.find((consent) => consent.id === selectedConsentId) || consents[0] || null,
    [consents, selectedConsentId]
  );
  const controlWhatsAppPayload = useMemo(
    () => createControlScheduleWhatsAppPayloadFromVisit(visit, outcomeRecord),
    [outcomeRecord, visit]
  );

  useEffect(() => {
    if (!selectedConsent) {
      setSelectedConsentId(null);
      return;
    }

    if (selectedConsent.id !== selectedConsentId) {
      setSelectedConsentId(selectedConsent.id);
    }
  }, [selectedConsent, selectedConsentId]);

  useEffect(() => {
    setDraft(buildConsentDraft(selectedConsent, visit));
  }, [selectedConsent?.id, selectedConsent?.updated_at, visit]);

  const baselineDraft = useMemo(() => buildConsentDraft(selectedConsent, visit), [selectedConsent?.id, selectedConsent?.updated_at, visit]);
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(baselineDraft);
  const readOnly = Boolean(workspaceLocked || selectedConsent?.source_record_status === 'final' || selectedConsent?.source_record_status === 'cancelled');

  const handleSave = async () => {
    if (!selectedConsent || readOnly || saving) {
      return;
    }

    setSaving(true);
    try {
      await onUpdateConsent(selectedConsent.id, draft);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeVisit = async (payload: FinalizeVisitPayload) => {
    setFinalizing(true);
    try {
      if (hasUnsavedChanges && selectedConsent && !readOnly) {
        await onUpdateConsent(selectedConsent.id, draft);
      }

      await onFinalizeVisit(payload);
    } finally {
      setFinalizing(false);
      setFinalizeOpen(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedConsent || printing) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        variant: 'destructive',
        title: 'Jendela cetak diblokir',
        description: 'Izinkan popup untuk membuka PDF informed consent.',
      });
      return;
    }

    printWindow.document.write('<html><head><title>Menyiapkan informed consent...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan PDF informed consent...</body></html>');
    printWindow.document.close();

    setPrinting(true);
    try {
      const response = await informedConsentsApi.print(selectedConsent.id);
      const contentType = response.headers['content-type'] || 'application/pdf';
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
        title: 'Gagal mencetak informed consent',
        description: requestError.response?.data?.error || 'PDF informed consent tidak dapat dibuat.',
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:overflow-hidden">
      <StickyVisitHeader
        visit={visit}
        completedSections={completedSections}
        isLocked={workspaceLocked}
        sticky
        sectionLabel="Informed Consent"
        allergyInfo={allergyInfo}
        onBack={onBack}
        prefetchedMonitorResult={prefetchedMonitorResult}
        prefetchedMonitorMessage={prefetchedMonitorMessage}
        statusNote={<span className="font-medium text-muted-foreground">{consents.length} consent</span>}
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

      <div className="min-h-0 flex-1 px-4 py-4 lg:px-5 xl:overflow-hidden">
        {consents.length === 0 ? (
          <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
            Belum ada draft informed consent pada kunjungan ini. Draft consent akan muncul otomatis setelah tindakan yang membutuhkan consent disimpan.
          </section>
        ) : (
          <div className="grid min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <div className="px-0.5">
                <h2 className="text-[13px] font-semibold tracking-tight">Daftar Consent</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Pilih draft consent untuk melihat dan melengkapi detail persetujuan tindakan.</p>
              </div>
              <div className="space-y-2">
                {consents.map((consent) => {
                  const selected = consent.id === selectedConsent?.id;
                  const decisionBadge = getDecisionBadge(consent.patient_decision);
                  const consentGiverName = consent.consent_giver_name || visit.patient?.full_name || 'Pasien';

                  return (
                    <button
                      key={consent.id}
                      type="button"
                      onClick={() => setSelectedConsentId(consent.id)}
                      className={cn(
                        'w-full border px-3 py-3 text-left transition-colors',
                        selected ? 'border-foreground/30 bg-muted/20 shadow-sm' : 'border-border/70 bg-background hover:bg-muted/10'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium text-foreground/95">{consent.action_name || 'Tindakan'}</p>
                        <Badge variant="outline" className={decisionBadge.className}>{decisionBadge.label}</Badge>
                      </div>
                      {consent.action_description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{consent.action_description}</p>}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{formatDateTime(consent.consent_date)}</span>
                        <span>Pemberi: {consentGiverName}</span>
                        <span>Saksi: {consent.witness_name || '-'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {selectedConsent && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border border-border/70 bg-background px-3 py-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold tracking-tight">{selectedConsent.action_name || 'Informed Consent'}</h2>
                        <Badge variant="outline" className={getDecisionBadge(selectedConsent.patient_decision).className}>{getDecisionBadge(selectedConsent.patient_decision).label}</Badge>
                        {selectedConsent.medical_action_id && <Badge variant="outline">Tindakan #{selectedConsent.medical_action_id}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">Dibuat {formatDate(selectedConsent.created_at || selectedConsent.consent_date)} · Record sumber #{selectedConsent.source_record_id}</p>
                      <p className="text-xs text-muted-foreground">Pemberi persetujuan: {selectedConsent.consent_giver_name || visit.patient?.full_name || '-'}{selectedConsent.consent_giver_relation ? ` · ${selectedConsent.consent_giver_relation}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="gap-1.5 rounded-none" onClick={handlePrint} disabled={printing}>
                        {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        {printing ? 'Menyiapkan PDF...' : 'Cetak PDF'}
                      </Button>
                      {!readOnly && (
                        <Button type="button" className="gap-1.5 rounded-none" onClick={handleSave} disabled={!hasUnsavedChanges || saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Simpan Consent
                        </Button>
                      )}
                    </div>
                  </div>

                  <TableSection
                    title="Form Informed Consent"
                    helper="Draft ini dibuat otomatis dari tindakan. Lengkapi pemberi persetujuan atau wali, keputusan pasien, saksi, manfaat, risiko, dan catatan sebelum finalisasi kunjungan."
                  >
                    <TableRow>
                      <TableCell label="Nama Tindakan" colSpan={2}>
                        <Input value={selectedConsent.action_name || ''} disabled className={PAPER_INPUT_CLASSNAME} />
                      </TableCell>
                      <TableCell label="Tanggal Consent">
                        <Input
                          type="datetime-local"
                          value={draft.consent_date}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_date: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                        />
                      </TableCell>
                      <TableCell label="Keputusan Pasien">
                        <SearchableSelect
                          options={DECISION_OPTIONS}
                          value={draft.patient_decision}
                          onValueChange={(value) => setDraft((current) => ({ ...current, patient_decision: value }))}
                          placeholder="Pilih keputusan"
                          searchPlaceholder="Cari keputusan..."
                          square
                          disabled={readOnly}
                          className={PAPER_SELECT_TRIGGER_CLASSNAME}
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Nama Pemberi Persetujuan" colSpan={2}>
                        <Input
                          value={draft.consent_giver_name}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_giver_name: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Nama pasien, wali, atau penanggung jawab"
                        />
                      </TableCell>
                      <TableCell label="Hubungan dengan Pasien">
                        <Input
                          value={draft.consent_giver_relation}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_giver_relation: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Mis. Pasien sendiri, Orang tua, Suami/Istri"
                        />
                      </TableCell>
                      <TableCell label="No. Identitas">
                        <Input
                          value={draft.consent_giver_id_number}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_giver_id_number: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="NIK / nomor identitas pemberi persetujuan"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Deskripsi Tindakan" colSpan={4}>
                        <TextEditor
                          label="Deskripsi Tindakan"
                          hideLabel
                          value={draft.action_description}
                          onChange={(value) => setDraft((current) => ({ ...current, action_description: value }))}
                          disabled={readOnly}
                          rows={4}
                          placeholder="Uraian tindakan dan target anatomi tindakan."
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Manfaat" colSpan={2}>
                        <TextEditor
                          label="Manfaat"
                          hideLabel
                          value={draft.benefits}
                          onChange={(value) => setDraft((current) => ({ ...current, benefits: value }))}
                          disabled={readOnly}
                          rows={5}
                          placeholder="Manfaat tindakan untuk pasien."
                        />
                      </TableCell>
                      <TableCell label="Risiko" colSpan={2}>
                        <TextEditor
                          label="Risiko"
                          hideLabel
                          value={draft.risks}
                          onChange={(value) => setDraft((current) => ({ ...current, risks: value }))}
                          disabled={readOnly}
                          rows={5}
                          placeholder="Risiko dan komplikasi yang perlu dijelaskan ke pasien."
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Nama Saksi" colSpan={2}>
                        <Input
                          value={draft.witness_name}
                          onChange={(event) => setDraft((current) => ({ ...current, witness_name: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Nama saksi informed consent"
                        />
                      </TableCell>
                      <TableCell label="Status Record" colSpan={2}>
                        <div className="text-sm text-foreground/90">{selectedConsent.source_record_status === 'final' ? 'Final' : selectedConsent.source_record_status === 'cancelled' ? 'Batal' : 'Draft aktif'}</div>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Catatan Consent" colSpan={4}>
                        <TextEditor
                          label="Catatan Consent"
                          hideLabel
                          value={draft.notes}
                          onChange={(value) => setDraft((current) => ({ ...current, notes: value }))}
                          disabled={readOnly}
                          rows={4}
                          placeholder="Catatan tambahan, edukasi ke pasien, atau alasan keputusan pasien."
                        />
                      </TableCell>
                    </TableRow>
                  </TableSection>
                </>
              )}
            </main>
          </div>
        )}
      </div>

      <FinalizeVisitDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        outcomeRecord={outcomeRecord}
        blockers={finalizeBlockers}
        submitting={finalizing}
        onSubmit={handleFinalizeVisit}
      />
    </div>
  );
}