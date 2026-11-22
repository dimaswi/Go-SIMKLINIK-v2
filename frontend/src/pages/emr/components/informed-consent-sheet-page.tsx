import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Copy,
  ExternalLink,
  FilePlus2,
  Loader2,
  Lock,
  PenTool,
  Printer,
  QrCode,
  Save,
  Smartphone,
  Stamp,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SignaturePadCanvas } from '@/components/signature-pad-canvas';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  informedConsentsApi,
  tteApi,
  type CreateInformedConsentPayload,
  type FinalizeVisitPayload,
  type InformedConsent,
  type MedicalActionItem,
  type MedicalRecord,
  type MedicalService,
  type SatusehatVisitAutoSyncResult,
  type TteEmployeeOption,
  type TteVisitDocument,
  type UpdateInformedConsentPayload,
  type Visit,
} from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';
import { ODONTOGRAM_SURFACE_LABELS } from '../odontogram';
import { formatDate, formatDateTime, formatDateTimeLocal, getPrimaryDiagnosis, type VisitInformedConsent } from '../utils';
import { FinalizeVisitDialog } from './finalize-visit-dialog';
import { FinalizedVisitActions } from './finalized-visit-actions';
import { PAPER_INPUT_CLASSNAME, PAPER_SELECT_TRIGGER_CLASSNAME, TableCell, TableRow, TableSection, TextEditor } from './form-fields';
import { StickyVisitHeader } from './sticky-visit-header';

type InformedConsentSheetPageProps = {
  visit: Visit;
  records: MedicalRecord[];
  serviceList: MedicalService[];
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
  onCreateConsent: (payload: CreateInformedConsentPayload) => Promise<InformedConsent | null>;
  onUpdateConsent: (consentId: number, payload: UpdateInformedConsentPayload) => Promise<void>;
  onDeleteConsent: (consentId: number) => Promise<void>;
  onPrintMedicalResume: () => Promise<void>;
  printingMedicalResume: boolean;
  onCancelFinalization: () => Promise<void>;
  cancelingFinalization: boolean;
  prefetchedMonitorResult?: SatusehatVisitAutoSyncResult | null;
  prefetchedMonitorMessage?: string;
};

const DECISION_OPTIONS = [
  { value: 'approved', label: 'Setuju / Disetujui Pasien' },
  { value: 'declined', label: 'Menolak / Ditolak Pasien' },
  { value: 'pending', label: 'Draft / Belum Ditetapkan' },
];

const RELATION_OPTIONS = [
  { value: 'Pasien sendiri', label: 'Pasien sendiri' },
  { value: 'Suami / Istri', label: 'Suami / Istri' },
  { value: 'Orang Tua', label: 'Orang Tua' },
  { value: 'Anak', label: 'Anak' },
  { value: 'Saudara Kandung', label: 'Saudara Kandung' },
  { value: 'Wali / Keluarga', label: 'Wali / Keluarga' },
];

const SUPPORTING_CATEGORY_TOKENS = ['laboratorium', 'laboratory', 'radiologi', 'radiology'];
const SUPPORTING_CODE_PREFIXES = ['SRV-LAB-', 'SRV-RAD-', 'MIG-LAB-', 'MIG-RAD-'];

function isProcedureService(service: MedicalService) {
  const categoryName = (service.category?.name || '').trim().toLowerCase();
  if (categoryName && SUPPORTING_CATEGORY_TOKENS.some((token) => categoryName.includes(token))) {
    return false;
  }
  const serviceCode = (service.code || '').toUpperCase();
  if (SUPPORTING_CODE_PREFIXES.some((prefix) => serviceCode.startsWith(prefix))) {
    return false;
  }
  const domain = (service.service_domain || 'general').toLowerCase();
  return domain === 'general' || domain === 'dental';
}

function formatActionTargetsSummary(action: MedicalActionItem) {
  const targets = action.targets || [];
  if (targets.length === 0) return '';
  return targets
    .map((t) => {
      switch (t.target_type) {
        case 'full_mouth':
          return 'seluruh mulut';
        case 'arch':
          return t.arch === 'upper' ? 'rahang atas' : 'rahang bawah';
        case 'quadrant':
          return t.quadrant || '';
        case 'tooth':
          return t.tooth_number ? `gigi ${t.tooth_number}` : '';
        case 'surface': {
          const surfaces = (t.surface_codes || [])
            .map((code) => ODONTOGRAM_SURFACE_LABELS[code as keyof typeof ODONTOGRAM_SURFACE_LABELS] || code)
            .join(', ');
          return t.tooth_number ? `gigi ${t.tooth_number}${surfaces ? ` (${surfaces})` : ''}` : '';
        }
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('; ');
}

function buildDefaultBenefits(domain?: string) {
  if (domain === 'dental') {
    return 'Membantu mengatasi keluhan gigi dan mulut, mengurangi nyeri atau infeksi, serta mengembalikan fungsi oral sesuai indikasi klinis.';
  }
  return 'Membantu menegakkan diagnosis atau terapi pasien, mengurangi keluhan, serta mendukung penatalaksanaan klinis sesuai indikasi medis.';
}

function buildDefaultRisks(domain?: string) {
  if (domain === 'dental') {
    return 'Risiko umum meliputi nyeri pasca tindakan, perdarahan, bengkak, infeksi, reaksi terhadap anestesi lokal atau obat, dan kemungkinan tindakan lanjutan.';
  }
  return 'Risiko umum meliputi nyeri, perdarahan, infeksi, reaksi alergi terhadap obat atau anestesi, serta kemungkinan komplikasi lain sesuai kondisi klinis pasien.';
}

function resolveDefaultDiagnosisFromRecords(records: MedicalRecord[]) {
  for (const record of records) {
    if (record.status === 'cancelled' || (record.entry_group_key || '').startsWith('surat')) continue;
    if (record.section_type === 'assessment') {
      if ((record.working_diagnosis || '').trim()) return record.working_diagnosis.trim();
      const primary = getPrimaryDiagnosis(record);
      if (primary?.icd10?.code && primary?.icd10?.name) {
        return `${primary.icd10.code} - ${primary.icd10.name}`;
      }
      if (primary?.working_diagnosis) return primary.working_diagnosis;
      if ((record.assessment || '').trim()) return record.assessment.trim();
    }
  }
  return '';
}

function buildConsentDraft(
  consent: VisitInformedConsent | null | undefined,
  visit: Visit,
  defaultDiagnosis: string
): UpdateInformedConsentPayload {
  return {
    medical_action_id: consent?.medical_action_id ?? null,
    medical_service_id: consent?.medical_service_id ?? null,
    action_name: consent?.action_name || '',
    diagnosis: consent?.diagnosis || defaultDiagnosis || '',
    action_description: consent?.action_description || '',
    risks: consent?.risks || '',
    benefits: consent?.benefits || '',
    alternatives: consent?.alternatives || 'Terapi konservatif / medikamentosa atau rujukan tindakan lanjutan sesuai kondisi klinis.',
    prognosis: consent?.prognosis || 'Dubia ad bonam (tergantung respons klinis pasien).',
    patient_decision: consent?.patient_decision || 'approved',
    consent_date: formatDateTimeLocal(consent?.consent_date) || formatDateTimeLocal(new Date().toISOString()),
    consent_giver_name: consent?.consent_giver_name || visit.patient?.full_name || '',
    consent_giver_relation: consent?.consent_giver_relation || 'Pasien sendiri',
    consent_giver_id_number: consent?.consent_giver_id_number || visit.patient?.nik || '',
    witness_name: consent?.witness_name || '',
    nurse_name: consent?.nurse_name || '',
    patient_signature: consent?.patient_signature || '',
    witness_signature: consent?.witness_signature || '',
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
      return { label: 'Draft', className: 'border-amber-300 bg-amber-50 text-amber-700' };
  }
}

export function InformedConsentSheetPage({
  visit,
  records,
  serviceList,
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
  onCreateConsent,
  onUpdateConsent,
  onDeleteConsent,
  onPrintMedicalResume,
  printingMedicalResume,
  onCancelFinalization,
  cancelingFinalization,
  prefetchedMonitorResult,
  prefetchedMonitorMessage,
}: InformedConsentSheetPageProps) {
  const { toast } = useToast();
  const defaultDiagnosis = useMemo(() => resolveDefaultDiagnosisFromRecords(records), [records]);

  const [selectedConsentId, setSelectedConsentId] = useState<number | null>(null);
  const [draft, setDraft] = useState<UpdateInformedConsentPayload>(() => buildConsentDraft(undefined, visit, defaultDiagnosis));
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VisitInformedConsent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [employees, setEmployees] = useState<TteEmployeeOption[]>([]);
  const [tteDocuments, setTteDocuments] = useState<TteVisitDocument[]>([]);

  // Drawer TTD Basah (Pasien / Wali & Saksi)
  const [wetDrawerRole, setWetDrawerRole] = useState<'patient' | 'witness' | null>(null);
  const [wetQrBlobUrl, setWetQrBlobUrl] = useState<string>('');
  const [wetSignLink, setWetSignLink] = useState<string>('');
  const [loadingWetQr, setLoadingWetQr] = useState(false);
  const [savingWetSignature, setSavingWetSignature] = useState(false);

  // Dialog Pilih Pegawai TTE Barcode (Dokter / Perawat)
  const [ttePickerRole, setTtePickerRole] = useState<'doctor' | 'nurse' | null>(null);
  const [selectedTteEmployeeId, setSelectedTteEmployeeId] = useState<string>('');
  const [submittingTte, setSubmittingTte] = useState(false);

  useEffect(() => {
    tteApi
      .getEmployees()
      .then((res) => setEmployees(res.data?.data || []))
      .catch(() => {});
  }, []);

  const reloadTteDocuments = () => {
    tteApi
      .getVisitDocuments(visit.id)
      .then((res) => setTteDocuments(res.data?.data?.documents || []))
      .catch(() => {});
  };

  useEffect(() => {
    reloadTteDocuments();
  }, [visit.id, consents.length]);

  const selectedConsent = useMemo(
    () => consents.find((consent) => consent.id === selectedConsentId) || consents[0] || null,
    [consents, selectedConsentId]
  );

  const doctorTteDocument = useMemo(() => {
    if (!selectedConsent) return null;
    const key = `informed_consent:${selectedConsent.id}`;
    return tteDocuments.find((doc) => doc.document_key === key) || null;
  }, [selectedConsent, tteDocuments]);

  const nurseTteDocument = useMemo(() => {
    if (!selectedConsent) return null;
    const key = `informed_consent_nurse:${selectedConsent.id}`;
    return tteDocuments.find((doc) => doc.document_key === key) || null;
  }, [selectedConsent, tteDocuments]);

  const controlWhatsAppPayload = useMemo(
    () => createControlScheduleWhatsAppPayloadFromVisit(visit, outcomeRecord),
    [outcomeRecord, visit]
  );

  const visitActions = useMemo(() => {
    return records
      .filter((r) => r.status !== 'cancelled' && r.section_type === 'procedure')
      .flatMap((r) => r.actions || []);
  }, [records]);

  const procedureServices = useMemo(
    () => serviceList.filter((s) => s.is_active !== false && isProcedureService(s)),
    [serviceList]
  );

  const actionSelectOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const act of visitActions) {
      const baseName = act.medical_service?.name || act.service_name_snapshot || `Tindakan #${act.id}`;
      const targetStr = formatActionTargetsSummary(act);
      const displayName = targetStr ? `${baseName} - ${targetStr}` : baseName;
      opts.push({
        value: `action:${act.id}`,
        label: `[Tindakan Kunjungan] ${displayName}`,
      });
    }
    for (const svc of procedureServices) {
      opts.push({
        value: `service:${svc.id}`,
        label: `${svc.name}${svc.code ? ` (${svc.code})` : ''}`,
      });
    }
    return opts;
  }, [visitActions, procedureServices]);

  const selectedActionPickerValue = useMemo(() => {
    if (draft.medical_action_id) {
      const key = `action:${draft.medical_action_id}`;
      if (actionSelectOptions.some((o) => o.value === key)) return key;
    }
    if (draft.medical_service_id) {
      const key = `service:${draft.medical_service_id}`;
      if (actionSelectOptions.some((o) => o.value === key)) return key;
    }
    if (draft.action_name) {
      const matched = actionSelectOptions.find(
        (o) => o.label.toLowerCase() === draft.action_name.toLowerCase() || o.label.toLowerCase().includes(draft.action_name.toLowerCase())
      );
      if (matched) return matched.value;
    }
    return '';
  }, [actionSelectOptions, draft.action_name, draft.medical_action_id, draft.medical_service_id]);

  const nurseEmployeeOptions = useMemo(() => {
    const opts = employees.map((emp) => ({
      value: emp.full_name,
      label: `${emp.full_name}${emp.profession ? ` (${emp.profession})` : ''}`,
    }));
    if (draft.nurse_name && !opts.some((o) => o.value === draft.nurse_name)) {
      opts.unshift({ value: draft.nurse_name, label: draft.nurse_name });
    }
    return opts;
  }, [employees, draft.nurse_name]);

  const tteEmployeePickerOptions = useMemo(
    () =>
      employees.map((emp) => ({
        value: String(emp.id),
        label: emp.full_name,
        description: [emp.profession, emp.employee_code, emp.license_number].filter(Boolean).join(' · ') || undefined,
        searchText: [emp.full_name, emp.profession, emp.employee_code, emp.license_number].filter(Boolean).join(' '),
      })),
    [employees]
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
    setDraft(buildConsentDraft(selectedConsent, visit, defaultDiagnosis));
  }, [selectedConsent?.id, selectedConsent?.updated_at, visit, defaultDiagnosis]);

  const baselineDraft = useMemo(
    () => buildConsentDraft(selectedConsent, visit, defaultDiagnosis),
    [selectedConsent?.id, selectedConsent?.updated_at, visit, defaultDiagnosis]
  );
  const hasUnsavedChanges = Boolean(selectedConsent) && JSON.stringify(draft) !== JSON.stringify(baselineDraft);
  const readOnly = Boolean(
    workspaceLocked ||
      selectedConsent?.source_record_status === 'final' ||
      selectedConsent?.source_record_status === 'cancelled'
  );

  // Load QR code & Polling live-sync ketika Drawer TTD Basah dibuka
  useEffect(() => {
    if (!wetDrawerRole || !selectedConsent) {
      setWetQrBlobUrl('');
      setWetSignLink('');
      return;
    }

    let cancelled = false;
    let currentObjectUrl = '';
    setLoadingWetQr(true);

    const baseUrl = window.location.origin;
    Promise.all([
      informedConsentsApi.getSignQrBlob(selectedConsent.id, wetDrawerRole, baseUrl),
      informedConsentsApi.getSignQrMeta(selectedConsent.id, wetDrawerRole, baseUrl),
    ])
      .then(([blobRes, metaRes]) => {
        if (cancelled) return;
        const blob = blobRes.data instanceof Blob ? blobRes.data : new Blob([blobRes.data], { type: 'image/png' });
        currentObjectUrl = URL.createObjectURL(blob);
        setWetQrBlobUrl(currentObjectUrl);
        setWetSignLink(metaRes.data?.data?.sign_url || '');
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingWetQr(false);
      });

    // Polling setiap 2.5 detik agar ketika pasien/saksi selesai TTD di HP, otomatis ter-update di komputer
    const pollInterval = window.setInterval(async () => {
      try {
        const res = await informedConsentsApi.getById(selectedConsent.id);
        const fresh = res.data?.data;
        if (!fresh || cancelled) return;

        const patientChanged =
          Boolean(fresh.patient_signature) && fresh.patient_signature !== draft.patient_signature;
        const witnessChanged =
          Boolean(fresh.witness_signature) && fresh.witness_signature !== draft.witness_signature;

        if (patientChanged || witnessChanged) {
          setDraft((prev) => ({
            ...prev,
            consent_giver_name: fresh.consent_giver_name || prev.consent_giver_name,
            consent_giver_relation: fresh.consent_giver_relation || prev.consent_giver_relation,
            consent_giver_id_number: fresh.consent_giver_id_number || prev.consent_giver_id_number,
            patient_signature: fresh.patient_signature || prev.patient_signature,
            witness_name: fresh.witness_name || prev.witness_name,
            witness_signature: fresh.witness_signature || prev.witness_signature,
          }));

          if (patientChanged && witnessChanged) {
            toast({
              variant: 'success',
              title: 'TTD Pasien & Saksi diterima dari HP!',
            });
          } else if (patientChanged) {
            toast({
              variant: 'success',
              title: 'TTD Pasien / Wali diterima dari HP!',
              description: `Ditandatangani oleh ${fresh.consent_giver_name || 'Pasien / Wali'}.`,
            });
          } else if (witnessChanged) {
            toast({
              variant: 'success',
              title: 'TTD Saksi diterima dari HP!',
              description: `Ditandatangani oleh ${fresh.witness_name || 'Saksi'}.`,
            });
          }
        }
      } catch {
        // ignore polling error
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [wetDrawerRole, selectedConsent?.id]);

  const handleSelectActionOption = (optionValue: string) => {
    if (!optionValue) return;
    if (optionValue.startsWith('action:')) {
      const actId = Number(optionValue.replace('action:', ''));
      const act = visitActions.find((item) => item.id === actId);
      if (!act) return;
      const svc = act.medical_service || procedureServices.find((s) => s.id === act.medical_service_id);
      const baseName = svc?.name || act.service_name_snapshot || 'Tindakan Medis';
      const targetStr = formatActionTargetsSummary(act);
      const resolvedName = targetStr && targetStr !== 'seluruh mulut' ? `${baseName} - ${targetStr}` : baseName;
      const domain = svc?.service_domain || act.service_domain_snapshot || 'general';
      const descParts = [
        svc?.description || '',
        targetStr ? `Target tindakan: ${targetStr}.` : '',
        act.notes ? `Catatan tindakan: ${act.notes}.` : '',
      ].filter(Boolean);

      setDraft((current) => ({
        ...current,
        medical_action_id: act.id,
        medical_service_id: act.medical_service_id || svc?.id || null,
        action_name: resolvedName,
        action_description: descParts.join(' ') || 'Tindakan dilakukan sesuai prosedur medis dan indikasi klinis dokter.',
        benefits: current.benefits || buildDefaultBenefits(domain),
        risks: current.risks || buildDefaultRisks(domain),
      }));
      return;
    }

    if (optionValue.startsWith('service:')) {
      const svcId = Number(optionValue.replace('service:', ''));
      const svc = procedureServices.find((item) => item.id === svcId);
      if (!svc) return;
      setDraft((current) => ({
        ...current,
        medical_action_id: null,
        medical_service_id: svc.id,
        action_name: svc.name,
        action_description: svc.description || 'Tindakan dilakukan sesuai prosedur medis dan indikasi klinis dokter.',
        benefits: current.benefits || buildDefaultBenefits(svc.service_domain),
        risks: current.risks || buildDefaultRisks(svc.service_domain),
      }));
    }
  };

  const handleCreateEntry = async () => {
    if (workspaceLocked || creating) return;

    setCreating(true);
    try {
      const firstVisitAction = visitActions[0];
      const firstSvc = firstVisitAction
        ? firstVisitAction.medical_service || procedureServices.find((s) => s.id === firstVisitAction.medical_service_id)
        : undefined;
      const targetStr = firstVisitAction ? formatActionTargetsSummary(firstVisitAction) : '';
      const baseName = firstVisitAction
        ? firstSvc?.name || firstVisitAction.service_name_snapshot || ''
        : '';
      const defaultActionName =
        baseName && targetStr && targetStr !== 'seluruh mulut' ? `${baseName} - ${targetStr}` : baseName;
      const domain = firstSvc?.service_domain || firstVisitAction?.service_domain_snapshot || 'general';

      const created = await onCreateConsent({
        visit_id: visit.id,
        medical_action_id: firstVisitAction?.id || null,
        medical_service_id: firstVisitAction?.medical_service_id || firstSvc?.id || null,
        action_name: defaultActionName,
        diagnosis: defaultDiagnosis,
        action_description: firstSvc?.description || (defaultActionName ? 'Tindakan dilakukan sesuai prosedur medis dan indikasi klinis dokter.' : ''),
        benefits: buildDefaultBenefits(domain),
        risks: buildDefaultRisks(domain),
        alternatives: 'Terapi konservatif / medikamentosa atau rujukan tindakan lanjutan sesuai kondisi klinis.',
        prognosis: 'Dubia ad bonam (tergantung respons klinis pasien).',
        patient_decision: 'approved',
        consent_giver_name: visit.patient?.full_name || '',
        consent_giver_relation: 'Pasien sendiri',
        consent_giver_id_number: visit.patient?.nik || '',
      });
      if (created) {
        setSelectedConsentId(created.id);
        reloadTteDocuments();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedConsent || readOnly || saving) return;
    if (!draft.action_name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Tindakan belum dipilih / diisi',
        description: 'Pilih atau isi nama tindakan yang akan dimintakan Informed Consent terlebih dahulu.',
      });
      return;
    }

    setSaving(true);
    try {
      await onUpdateConsent(selectedConsent.id, draft);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWetSignatureFromDrawer = async (dataUrl: string) => {
    if (!selectedConsent || !wetDrawerRole || savingWetSignature) return;
    setSavingWetSignature(true);
    try {
      const nextDraft: UpdateInformedConsentPayload = {
        ...draft,
        action_name: draft.action_name.trim() || selectedConsent.action_name || 'Tindakan Kedokteran',
        ...(wetDrawerRole === 'patient'
          ? { patient_signature: dataUrl }
          : { witness_signature: dataUrl }),
      };
      setDraft(nextDraft);
      await onUpdateConsent(selectedConsent.id, nextDraft);
      setWetDrawerRole(null);
    } finally {
      setSavingWetSignature(false);
    }
  };

  const handleClearWetSignature = async (role: 'patient' | 'witness') => {
    if (!selectedConsent || readOnly) return;
    const nextDraft: UpdateInformedConsentPayload = {
      ...draft,
      action_name: draft.action_name.trim() || selectedConsent.action_name || 'Tindakan Kedokteran',
      ...(role === 'patient' ? { patient_signature: '' } : { witness_signature: '' }),
    };
    setDraft(nextDraft);
    await onUpdateConsent(selectedConsent.id, nextDraft);
  };

  const openTteBarcodePicker = (role: 'doctor' | 'nurse') => {
    if (!selectedConsent) return;
    setTtePickerRole(role);

    const candidateName = (
      role === 'doctor'
        ? doctorTteDocument?.signer_name || visit.doctor?.full_name || ''
        : nurseTteDocument?.signer_name || draft.nurse_name || ''
    )
      .trim()
      .toLowerCase();

    if (candidateName && employees.length > 0) {
      const matched =
        employees.find((emp) => emp.full_name.trim().toLowerCase() === candidateName) ||
        employees.find(
          (emp) =>
            emp.full_name.trim().toLowerCase().includes(candidateName) ||
            candidateName.includes(emp.full_name.trim().toLowerCase())
        );
      setSelectedTteEmployeeId(matched ? String(matched.id) : '');
    } else {
      setSelectedTteEmployeeId('');
    }
  };

  const handleConfirmTteBarcode = async () => {
    if (!selectedConsent || !ttePickerRole || !selectedTteEmployeeId) return;
    const employeeId = Number(selectedTteEmployeeId);
    const chosenEmp = employees.find((emp) => emp.id === employeeId);
    const documentKey =
      ttePickerRole === 'doctor'
        ? `informed_consent:${selectedConsent.id}`
        : `informed_consent_nurse:${selectedConsent.id}`;

    setSubmittingTte(true);
    try {
      if (ttePickerRole === 'nurse' && chosenEmp?.full_name && draft.nurse_name !== chosenEmp.full_name && !readOnly) {
        const nextDraft = {
          ...draft,
          action_name: draft.action_name.trim() || selectedConsent.action_name || 'Tindakan Kedokteran',
          nurse_name: chosenEmp.full_name,
        };
        setDraft(nextDraft);
        await onUpdateConsent(selectedConsent.id, nextDraft);
      }

      const response = await tteApi.sign({
        visit_id: visit.id,
        document_key: documentKey,
        employee_id: employeeId,
      });
      const updatedDoc = response.data.data;
      setTteDocuments((prev) => {
        const exists = prev.some((d) => d.document_key === updatedDoc.document_key);
        if (exists) {
          return prev.map((d) => (d.document_key === updatedDoc.document_key ? updatedDoc : d));
        }
        return [...prev, updatedDoc];
      });
      setTtePickerRole(null);
      setSelectedTteEmployeeId('');
      toast({
        variant: 'success',
        title: `Barcode TTE ${ttePickerRole === 'doctor' ? 'Dokter' : 'Perawat'} berhasil dipasang`,
        description: `Ditandatangani atas nama ${chosenEmp?.full_name || updatedDoc.signer_name}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memasang Barcode TTE',
        description: err.response?.data?.error || 'Tidak dapat melakukan TTE pada dokumen ini.',
      });
    } finally {
      setSubmittingTte(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await onDeleteConsent(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleFinalizeVisit = async (payload: FinalizeVisitPayload) => {
    setFinalizing(true);
    try {
      if (hasUnsavedChanges && selectedConsent && !readOnly && draft.action_name.trim()) {
        await onUpdateConsent(selectedConsent.id, draft);
      }
      await onFinalizeVisit(payload);
    } finally {
      setFinalizing(false);
      setFinalizeOpen(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedConsent || printing) return;

    if (hasUnsavedChanges && !readOnly && draft.action_name.trim()) {
      await onUpdateConsent(selectedConsent.id, draft);
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

    printWindow.document.write(
      '<html><head><title>Menyiapkan informed consent...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan PDF informed consent...</body></html>'
    );
    printWindow.document.close();

    setPrinting(true);
    try {
      const response = await informedConsentsApi.print(selectedConsent.id);
      const contentType = response.headers['content-type'] || 'application/pdf';
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
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

  const isDoctorTteSigned = doctorTteDocument?.status === 'signed';
  const isNurseTteSigned = nurseTteDocument?.status === 'signed';

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
        statusNote={<span className="font-medium text-muted-foreground">{consents.length} entri consent</span>}
        actions={
          !workspaceLocked ? (
            <Button className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" onClick={() => setFinalizeOpen(true)} title="Final Kunjungan">
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
          ) : undefined
        }
      />

      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1.5 lg:px-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <div className="grid gap-0 border border-border/70 bg-background xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
          {/* Sidebar Entri Informed Consent */}
          <aside className="border-b border-border/70 bg-background xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:border-b-0 xl:border-r xl:border-r-border/70">
            <div className="border-b border-border/70 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Informed Consent</h2>
                <Badge variant="outline" className="rounded-none text-[11px] font-mono">
                  {consents.length} entri
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tambahkan entri persetujuan/penolakan tindakan dan pilih tindakan yang akan di-consent.
              </p>

              {!workspaceLocked && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 rounded-none shadow-none"
                    onClick={handleCreateEntry}
                    disabled={creating}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    Tambah Entri
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5 rounded-none shadow-none"
                    onClick={handleSave}
                    disabled={!selectedConsent || readOnly || saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Entri
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 p-2.5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {consents.length === 0 ? (
                <div className="border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
                  Belum ada entri informed consent. Klik <strong>Tambah Entri</strong> untuk membuat persetujuan tindakan baru.
                </div>
              ) : (
                consents.map((consent, idx) => {
                  const selected = consent.id === selectedConsent?.id;
                  const decisionBadge = getDecisionBadge(consent.patient_decision);
                  const consentGiverName = consent.consent_giver_name || visit.patient?.full_name || 'Pasien';

                  return (
                    <div
                      key={consent.id}
                      className={cn(
                        'border transition-colors',
                        selected ? 'border-foreground/30 bg-muted/20 shadow-sm' : 'border-border/70 bg-background hover:bg-muted/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedConsentId(consent.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground">#{consents.length - idx}</span>
                            <p className="truncate text-xs font-semibold text-foreground/95">
                              {consent.action_name || 'Draft Informed Consent'}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={cn('rounded-none text-[10px] px-1.5 py-0', decisionBadge.className)}>
                            {decisionBadge.label}
                          </Badge>
                          {!workspaceLocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 rounded-none text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(consent)}
                              title="Hapus entri consent"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedConsentId(consent.id)}
                        className="w-full px-3 pb-2.5 pt-1 text-left"
                      >
                        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{formatDateTime(consent.consent_date)}</span>
                          <span>· Pasien/Wali: {consentGiverName}</span>
                          {consent.nurse_name && <span>· Perawat: {consent.nurse_name}</span>}
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main Workspace Form Informed Consent */}
          <main className="min-w-0 bg-background xl:h-full xl:min-h-0 xl:overflow-hidden">
            <div className="space-y-3 px-3 py-3 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-y-auto">
              {!selectedConsent ? (
                <section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">Belum Ada Entri Informed Consent</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Buat entri baru, pilih tindakan medis yang akan dilakukan, lengkapi penjelasan klinis, serta 4 penandatangan (Pasien/Wali, Saksi, Dokter, Perawat).
                  </p>
                  {!workspaceLocked && (
                    <div className="mt-4">
                      <Button type="button" className="gap-1.5 rounded-none" onClick={handleCreateEntry} disabled={creating}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                        Tambah Entri Informed Consent
                      </Button>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border border-border/70 bg-background px-3 py-2.5">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold tracking-tight">
                          {draft.action_name || selectedConsent.action_name || 'Form Informed Consent'}
                        </h2>
                        <Badge variant="outline" className={cn('rounded-none', getDecisionBadge(draft.patient_decision).className)}>
                          {getDecisionBadge(draft.patient_decision).label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dibuat {formatDate(selectedConsent.created_at || selectedConsent.consent_date)} · TTD Basah Drawer/HP (Pasien & Saksi) + Barcode TTE (Dokter & Perawat)
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-none" onClick={handlePrint} disabled={printing}>
                        {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                        {printing ? 'Menyiapkan PDF...' : 'Cetak PDF'}
                      </Button>
                      {!readOnly && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-none text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(selectedConsent)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </Button>
                          <Button type="button" size="sm" className="gap-1.5 rounded-none" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Simpan Consent
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* SEKSI 1: TINDAKAN & KEPUTUSAN */}
                  <TableSection title="Tindakan Kedokteran & Keputusan">
                    <TableRow>
                      <TableCell label="Tindakan Kedokteran *" colSpan={2}>
                        <SearchableSelect
                          options={actionSelectOptions}
                          value={selectedActionPickerValue}
                          onValueChange={handleSelectActionOption}
                          placeholder="Pilih tindakan yang akan di-informed consent..."
                          searchPlaceholder="Cari nama tindakan..."
                          square
                          disabled={readOnly}
                          className={PAPER_SELECT_TRIGGER_CLASSNAME}
                        />
                      </TableCell>
                      <TableCell label="Keputusan Pasien / Wali">
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
                      <TableCell label="Tanggal & Jam">
                        <Input
                          type="datetime-local"
                          value={draft.consent_date}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_date: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Diagnosis / Indikasi Tindakan" colSpan={2}>
                        <Input
                          value={draft.diagnosis}
                          onChange={(event) => setDraft((current) => ({ ...current, diagnosis: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Diagnosis kerja / indikasi dilakukan tindakan"
                        />
                      </TableCell>
                      <TableCell label="Alternatif Tindakan">
                        <Input
                          value={draft.alternatives}
                          onChange={(event) => setDraft((current) => ({ ...current, alternatives: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Alternatif selain tindakan ini"
                        />
                      </TableCell>
                      <TableCell label="Prognosis">
                        <Input
                          value={draft.prognosis}
                          onChange={(event) => setDraft((current) => ({ ...current, prognosis: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Mis. Dubia ad bonam"
                        />
                      </TableCell>
                    </TableRow>
                  </TableSection>

                  {/* SEKSI 2: PENJELASAN KLINIS TINDAKAN */}
                  <TableSection title="Penjelasan Informasi Tindakan">
                    <TableRow>
                      <TableCell label="Tata Cara / Deskripsi Tindakan" colSpan={2}>
                        <TextEditor
                          label="Tata Cara / Deskripsi Tindakan"
                          hideLabel
                          value={draft.action_description}
                          onChange={(value) => setDraft((current) => ({ ...current, action_description: value }))}
                          disabled={readOnly}
                          rows={3}
                          placeholder="Uraian singkat prosedur/tahapan tindakan kedokteran yang akan dilakukan."
                        />
                      </TableCell>
                      <TableCell label="Catatan Tambahan / Edukasi" colSpan={2}>
                        <TextEditor
                          label="Catatan Tambahan"
                          hideLabel
                          value={draft.notes}
                          onChange={(value) => setDraft((current) => ({ ...current, notes: value }))}
                          disabled={readOnly}
                          rows={3}
                          placeholder="Catatan tambahan, edukasi khusus, atau alasan penolakan pasien."
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell label="Tujuan & Manfaat Tindakan" colSpan={2}>
                        <TextEditor
                          label="Tujuan & Manfaat Tindakan"
                          hideLabel
                          value={draft.benefits}
                          onChange={(value) => setDraft((current) => ({ ...current, benefits: value }))}
                          disabled={readOnly}
                          rows={3}
                          placeholder="Tujuan dan manfaat tindakan bagi pasien."
                        />
                      </TableCell>
                      <TableCell label="Risiko & Komplikasi" colSpan={2}>
                        <TextEditor
                          label="Risiko & Komplikasi"
                          hideLabel
                          value={draft.risks}
                          onChange={(value) => setDraft((current) => ({ ...current, risks: value }))}
                          disabled={readOnly}
                          rows={3}
                          placeholder="Risiko dan komplikasi yang dapat terjadi selama/setelah tindakan."
                        />
                      </TableCell>
                    </TableRow>
                  </TableSection>

                  {/* SEKSI 3: PEMBERI PERSETUJUAN & 4 PENANDATANGAN */}
                  <TableSection title="Pemberi Persetujuan & 4 Penandatangan">
                    <TableRow>
                      <TableCell label="Hubungan Pemberi Persetujuan" colSpan={2}>
                        <SearchableSelect
                          options={RELATION_OPTIONS}
                          value={draft.consent_giver_relation}
                          onValueChange={(value) => {
                            const isSelf = value === 'Pasien sendiri';
                            setDraft((current) => ({
                              ...current,
                              consent_giver_relation: value,
                              consent_giver_name: isSelf ? visit.patient?.full_name || current.consent_giver_name : current.consent_giver_name,
                              consent_giver_id_number: isSelf ? visit.patient?.nik || current.consent_giver_id_number : current.consent_giver_id_number,
                            }));
                          }}
                          placeholder="Pilih hubungan dengan pasien..."
                          searchPlaceholder="Cari hubungan..."
                          square
                          disabled={readOnly}
                          className={PAPER_SELECT_TRIGGER_CLASSNAME}
                        />
                      </TableCell>
                      <TableCell label="No. Identitas (NIK Pasien / Wali)" colSpan={2}>
                        <Input
                          value={draft.consent_giver_id_number}
                          onChange={(event) => setDraft((current) => ({ ...current, consent_giver_id_number: event.target.value }))}
                          disabled={readOnly}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="NIK pasien atau wali pemberi persetujuan"
                        />
                      </TableCell>
                    </TableRow>

                    {/* Baris 4 Kolom Tanda Tangan */}
                    <TableRow>
                      {/* 1. TTD PASIEN / WALI (Drawer TTD Basah + Scan QR HP) */}
                      <TableCell label="1. TTD Pasien / Wali (TTD Basah)">
                        <div className="space-y-2">
                          <Input
                            value={draft.consent_giver_name}
                            onChange={(event) => setDraft((current) => ({ ...current, consent_giver_name: event.target.value }))}
                            disabled={readOnly}
                            className={PAPER_INPUT_CLASSNAME}
                            placeholder="Nama pasien / wali"
                          />
                          {draft.patient_signature ? (
                            <div className="space-y-1.5 border border-emerald-300 bg-emerald-50/40 p-2">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Sudah TTD Basah
                                </span>
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => void handleClearWetSignature('patient')}
                                    className="text-[10px] font-medium text-rose-600 hover:underline"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                              <div className="flex h-16 items-center justify-center border border-border/60 bg-white p-1">
                                <img
                                  src={draft.patient_signature}
                                  alt="TTD Pasien"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex h-12 items-center justify-center border border-dashed border-border/70 bg-muted/10 px-2 text-center text-[11px] text-muted-foreground">
                              Belum ada TTD basah
                            </div>
                          )}
                          <Button
                            type="button"
                            variant={draft.patient_signature ? 'outline' : 'default'}
                            size="sm"
                            className="w-full gap-1.5 rounded-none text-xs"
                            onClick={() => setWetDrawerRole('patient')}
                          >
                            <PenTool className="h-3.5 w-3.5" />
                            {draft.patient_signature ? 'Ubah TTD / Scan HP' : 'Drawer TTD / Scan HP'}
                          </Button>
                        </div>
                      </TableCell>

                      {/* 2. TTD SAKSI (Drawer TTD Basah + Scan QR HP) */}
                      <TableCell label="2. TTD Saksi (TTD Basah)">
                        <div className="space-y-2">
                          <Input
                            value={draft.witness_name}
                            onChange={(event) => setDraft((current) => ({ ...current, witness_name: event.target.value }))}
                            disabled={readOnly}
                            className={PAPER_INPUT_CLASSNAME}
                            placeholder="Nama saksi"
                          />
                          {draft.witness_signature ? (
                            <div className="space-y-1.5 border border-emerald-300 bg-emerald-50/40 p-2">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Sudah TTD Basah
                                </span>
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => void handleClearWetSignature('witness')}
                                    className="text-[10px] font-medium text-rose-600 hover:underline"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                              <div className="flex h-16 items-center justify-center border border-border/60 bg-white p-1">
                                <img
                                  src={draft.witness_signature}
                                  alt="TTD Saksi"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex h-12 items-center justify-center border border-dashed border-border/70 bg-muted/10 px-2 text-center text-[11px] text-muted-foreground">
                              Belum ada TTD basah
                            </div>
                          )}
                          <Button
                            type="button"
                            variant={draft.witness_signature ? 'outline' : 'default'}
                            size="sm"
                            className="w-full gap-1.5 rounded-none text-xs"
                            onClick={() => setWetDrawerRole('witness')}
                          >
                            <PenTool className="h-3.5 w-3.5" />
                            {draft.witness_signature ? 'Ubah TTD / Scan HP' : 'Drawer TTD / Scan HP'}
                          </Button>
                        </div>
                      </TableCell>

                      {/* 3. TTD DOKTER (Barcode TTE) */}
                      <TableCell label="3. TTD Dokter (Barcode TTE)">
                        <div className="space-y-2">
                          <Input
                            value={doctorTteDocument?.signer_name || visit.doctor?.full_name || '-'}
                            disabled
                            className={PAPER_INPUT_CLASSNAME}
                          />
                          {isDoctorTteSigned ? (
                            <div className="flex h-16 flex-col items-center justify-center gap-0.5 border border-emerald-300 bg-emerald-50/50 px-2 text-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <QrCode className="h-3.5 w-3.5" />
                                Barcode TTE Aktif
                              </span>
                              <span className="truncate max-w-full text-[10px] text-emerald-800">
                                {doctorTteDocument?.signer_name || visit.doctor?.full_name}
                              </span>
                            </div>
                          ) : (
                            <div className="flex h-12 items-center justify-center border border-dashed border-border/70 bg-muted/10 px-2 text-center text-[11px] text-muted-foreground">
                              Belum TTE Barcode
                            </div>
                          )}
                          <Button
                            type="button"
                            variant={isDoctorTteSigned ? 'outline' : 'default'}
                            size="sm"
                            className={cn(
                              'w-full gap-1.5 rounded-none text-xs',
                              isDoctorTteSigned && 'border-emerald-300 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100'
                            )}
                            onClick={() => openTteBarcodePicker('doctor')}
                          >
                            <Stamp className="h-3.5 w-3.5" />
                            {isDoctorTteSigned ? 'Ubah TTE Dokter' : 'Klik TTE Barcode'}
                          </Button>
                        </div>
                      </TableCell>

                      {/* 4. TTD PERAWAT (Barcode TTE) */}
                      <TableCell label="4. TTD Perawat (Barcode TTE)">
                        <div className="space-y-2">
                          <SearchableSelect
                            options={nurseEmployeeOptions}
                            value={draft.nurse_name}
                            onValueChange={(value) => setDraft((current) => ({ ...current, nurse_name: value }))}
                            placeholder="Pilih perawat..."
                            searchPlaceholder="Cari nama perawat..."
                            square
                            disabled={readOnly}
                            className={PAPER_SELECT_TRIGGER_CLASSNAME}
                          />
                          {isNurseTteSigned ? (
                            <div className="flex h-16 flex-col items-center justify-center gap-0.5 border border-emerald-300 bg-emerald-50/50 px-2 text-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <QrCode className="h-3.5 w-3.5" />
                                Barcode TTE Aktif
                              </span>
                              <span className="truncate max-w-full text-[10px] text-emerald-800">
                                {nurseTteDocument?.signer_name || draft.nurse_name}
                              </span>
                            </div>
                          ) : (
                            <div className="flex h-12 items-center justify-center border border-dashed border-border/70 bg-muted/10 px-2 text-center text-[11px] text-muted-foreground">
                              Belum TTE Barcode
                            </div>
                          )}
                          <Button
                            type="button"
                            variant={isNurseTteSigned ? 'outline' : 'default'}
                            size="sm"
                            className={cn(
                              'w-full gap-1.5 rounded-none text-xs',
                              isNurseTteSigned && 'border-emerald-300 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100'
                            )}
                            onClick={() => openTteBarcodePicker('nurse')}
                          >
                            <Stamp className="h-3.5 w-3.5" />
                            {isNurseTteSigned ? 'Ubah TTE Perawat' : 'Klik TTE Barcode'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableSection>
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* DRAWER TTD BASAH & QR SCAN HP (PASIEN / WALI & SAKSI) */}
      <Sheet
        open={Boolean(wetDrawerRole)}
        onOpenChange={(open) => {
          if (!open) setWetDrawerRole(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
          <div className="flex min-h-full flex-col">
            <SheetHeader className="border-b border-border/70 px-6 py-4 text-left">
              <SheetTitle>
                Drawer Tanda Tangan Basah — {wetDrawerRole === 'patient' ? '1. Pasien / Wali' : '2. Saksi'}
              </SheetTitle>
              <SheetDescription>
                Bisa ditandatangani langsung di layar ini atau scan QR menggunakan HP Pasien / HP Petugas.
              </SheetDescription>
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => setWetDrawerRole('patient')}
                  className={cn(
                    'flex items-center justify-between border px-3 py-2 text-left text-xs font-bold transition-colors',
                    wetDrawerRole === 'patient'
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted/30'
                  )}
                >
                  <span>1. Pasien / Wali</span>
                  {draft.patient_signature ? (
                    <BadgeCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-[10px] font-normal opacity-75">Belum</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setWetDrawerRole('witness')}
                  className={cn(
                    'flex items-center justify-between border px-3 py-2 text-left text-xs font-bold transition-colors',
                    wetDrawerRole === 'witness'
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted/30'
                  )}
                >
                  <span>2. Saksi</span>
                  {draft.witness_signature ? (
                    <BadgeCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-[10px] font-normal opacity-75">Belum</span>
                  )}
                </button>
              </div>
            </SheetHeader>

            <div className="space-y-5 px-6 py-5">
              {/* Opsi 1: Scan QR di HP Pasien / Petugas */}
              <div className="space-y-3 border border-border/80 bg-muted/15 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-foreground" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide">
                        Scan QR untuk TTD Basah di HP Pasien / Petugas
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Arahkan kamera HP ke QR ini. Begitu disimpan di HP, tanda tangan otomatis masuk ke layar ini.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <div className="flex h-40 w-40 shrink-0 items-center justify-center border border-border bg-white p-2">
                    {loadingWetQr ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : wetQrBlobUrl ? (
                      <img src={wetQrBlobUrl} alt="QR TTD HP" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">QR tidak tersedia</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2 text-xs">
                    <div className="border border-border/70 bg-background p-2.5">
                      <p className="font-semibold text-foreground">
                        Penandatangan: {wetDrawerRole === 'patient' ? draft.consent_giver_name || 'Pasien / Wali' : draft.witness_name || 'Saksi'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Tindakan: {draft.action_name || selectedConsent?.action_name || '-'}
                      </p>
                    </div>

                    {wetSignLink && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-none text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(wetSignLink);
                            toast({
                              title: 'Link tanda tangan disalin',
                              description: 'Link dapat dikirim ke WhatsApp / browser HP pasien atau petugas.',
                            });
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Salin Link HP
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-none text-xs"
                          onClick={() => window.open(wetSignLink, '_blank')}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Buka Halaman HP
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Opsi 2: TTD Langsung di Drawer Ini */}
              <div className="space-y-3 border border-border/80 bg-background p-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide">
                    Atau Tanda Tangan Langsung di Layar Ini
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Pastikan nama penandatangan sudah sesuai lalu goreskan tanda tangan di kotak putih di bawah.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">
                    {wetDrawerRole === 'patient' ? 'Nama Lengkap Pasien / Wali' : 'Nama Lengkap Saksi'}
                  </label>
                  <Input
                    value={wetDrawerRole === 'patient' ? draft.consent_giver_name : draft.witness_name}
                    onChange={(event) => {
                      const val = event.target.value;
                      setDraft((current) =>
                        wetDrawerRole === 'patient'
                          ? { ...current, consent_giver_name: val }
                          : { ...current, witness_name: val }
                      );
                    }}
                    disabled={readOnly}
                    placeholder={wetDrawerRole === 'patient' ? 'Nama pasien / wali' : 'Nama saksi'}
                    className="rounded-none"
                  />
                </div>

                <SignaturePadCanvas
                  initialSignature={wetDrawerRole === 'patient' ? draft.patient_signature : draft.witness_signature}
                  disabled={readOnly}
                  height={220}
                  saving={savingWetSignature}
                  saveLabel="Simpan TTD Basah"
                  onSave={(dataUrl) => void handleSaveWetSignatureFromDrawer(dataUrl)}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* DIALOG PILIH PEGAWAI BARCODE TTE (DOKTER / PERAWAT) */}
      <Dialog
        open={Boolean(ttePickerRole)}
        onOpenChange={(open) => {
          if (!submittingTte && !open) {
            setTtePickerRole(null);
            setSelectedTteEmployeeId('');
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-none border-border/70">
          <DialogHeader>
            <DialogTitle>
              Barcode TTE {ttePickerRole === 'doctor' ? 'Dokter Pelaksana' : 'Perawat Pendamping'}
            </DialogTitle>
            <DialogDescription>
              Pilih pegawai untuk mengesahkan kolom {ttePickerRole === 'doctor' ? 'Dokter' : 'Perawat'} pada Informed Consent ini. Barcode QR validasi akan tercetak otomatis pada PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label className="text-xs font-medium text-foreground">
              Pilih Pegawai ({ttePickerRole === 'doctor' ? 'Dokter' : 'Perawat'})
            </label>
            <SearchableSelect
              options={tteEmployeePickerOptions}
              value={selectedTteEmployeeId}
              onValueChange={setSelectedTteEmployeeId}
              placeholder="Cari & pilih pegawai..."
              searchPlaceholder="Ketik nama, profesi, atau NIP..."
              emptyText="Pegawai tidak ditemukan."
              square
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => setTtePickerRole(null)}
              disabled={submittingTte}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="gap-1.5 rounded-none"
              onClick={() => void handleConfirmTteBarcode()}
              disabled={!selectedTteEmployeeId || submittingTte}
            >
              {submittingTte ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
              {submittingTte ? 'Memproses...' : 'Setujui & Pasang Barcode TTE'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="Hapus Entri Informed Consent"
        description={`Yakin ingin menghapus informed consent "${deleteTarget?.action_name || 'Draft Informed Consent'}"?`}
        confirmText={deleting ? 'Menghapus...' : 'Hapus'}
        cancelText="Batal"
        variant="destructive"
      />

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
