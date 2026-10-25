import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  medicalRecordsApi,
  type MedicalRecord,
  type Visit,
  type Prescription,
  type PrescriptionCompound,
  type MedicalActionItem,
} from '@/lib/api';
import { formatDateTime, getPatientAge } from '../utils';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCheck2,
  FileText,
  HeartPulse,
  History,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Pill,
  RefreshCw,
  Search,
  Stethoscope,
  Syringe,
  Tag,
  X,
} from 'lucide-react';

type PatientMedicalHistoryDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: Visit;
};

type GroupedVisitHistory = {
  visitId: number;
  visitNumber: string;
  visitDate: string;
  doctorName: string;
  polyclinicName: string;
  paymentType: string;
  queueNumber?: number;
  isCurrentVisit: boolean;
  records: MedicalRecord[];
  diagnoses: {
    code: string;
    description: string;
    isPrimary: boolean;
  }[];
  prescriptions: Prescription[];
  compounds: PrescriptionCompound[];
  actions: MedicalActionItem[];
  vitals: {
    bp?: string;
    hr?: string;
    temp?: string;
    rr?: string;
    spo2?: string;
    weight?: string;
    height?: string;
    bmi?: string;
    consciousness?: string;
  };
  anamnesis: {
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    pastMedicalHistory?: string;
    allergyNotes?: string;
  };
  physicalExamNotes?: string;
  assessmentNotes?: string;
  planNotes?: string;
  suratTypes: string[];
};

export function PatientMedicalHistoryDrawer({
  open,
  onOpenChange,
  visit,
}: PatientMedicalHistoryDrawerProps) {
  const { toast } = useToast();
  const patient = visit.patient;
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPoli, setSelectedPoli] = useState<string>('all');
  const [expandedVisits, setExpandedVisits] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const patientId = patient?.id;
  const patientAge = getPatientAge(patient?.birth_date);
  const genderLabel = patient?.gender === 'L' ? 'Laki-laki' : patient?.gender === 'P' ? 'Perempuan' : '-';

  // Load all medical records for this patient
  const loadHistory = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const response = await medicalRecordsApi.getByPatient(patientId);
      const data: MedicalRecord[] = response.data?.data || [];
      setRecords(data);

      // Default expand the 2 most recent visits
      const visitIds: number[] = Array.from(new Set(data.map((r: MedicalRecord) => r.visit_id).filter(Boolean)));
      const initialExpanded: Record<number, boolean> = {};
      visitIds.slice(0, 3).forEach((id: number) => {
        initialExpanded[id] = true;
      });
      setExpandedVisits(initialExpanded);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Gagal Memuat Riwayat',
        description: 'Tidak dapat mengambil rekam medis pasien dari server.',
      });
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => {
    if (open && patientId) {
      void loadHistory();
    }
  }, [open, patientId, loadHistory]);

  // Group records by Visit
  const groupedVisits = useMemo<GroupedVisitHistory[]>(() => {
    if (!records || records.length === 0) return [];

    const map = new Map<number, GroupedVisitHistory>();

    for (const rec of records) {
      const vId = rec.visit_id;
      if (!vId) continue;

      if (!map.has(vId)) {
        const v = rec.visit;
        const fallbackDate = rec.record_date || (rec as any).created_at || new Date().toISOString();
        map.set(vId, {
          visitId: vId,
          visitNumber: v?.visit_number || String(vId),
          visitDate: v?.visit_date || fallbackDate,
          doctorName: rec.doctor?.full_name || v?.doctor?.full_name || '-',
          polyclinicName: rec.polyclinic?.name || v?.polyclinic?.name || '-',
          paymentType: v?.payment_type || '-',
          queueNumber: v?.queue_number,
          isCurrentVisit: vId === visit.id,
          records: [],
          diagnoses: [],
          prescriptions: [],
          compounds: [],
          actions: [],
          vitals: {},
          anamnesis: {},
          suratTypes: [],
        });
      }

      const item = map.get(vId)!;
      item.records.push(rec);

      // Collect diagnoses
      if (rec.diagnoses && rec.diagnoses.length > 0) {
        for (const d of rec.diagnoses) {
          const code = d.icd10?.code || (d as any).code || '-';
          const description = d.icd10?.name_id || d.working_diagnosis || (d as any).description || '-';
          if (!item.diagnoses.some((existing) => existing.code === code && existing.description === description)) {
            item.diagnoses.push({
              code,
              description,
              isPrimary: d.diagnosis_type === 'primer',
            });
          }
        }
      }

      // Collect prescriptions
      if (rec.prescriptions && rec.prescriptions.length > 0) {
        for (const p of rec.prescriptions) {
          if (!item.prescriptions.some((existing) => existing.id === p.id)) {
            item.prescriptions.push(p);
          }
        }
      }

      // Collect compounds
      if (rec.prescription_compounds && rec.prescription_compounds.length > 0) {
        for (const c of rec.prescription_compounds) {
          if (!item.compounds.some((existing) => existing.id === c.id)) {
            item.compounds.push(c);
          }
        }
      }

      // Collect actions / procedures
      if (rec.actions && rec.actions.length > 0) {
        for (const a of rec.actions) {
          if (!item.actions.some((existing) => existing.id === a.id)) {
            item.actions.push(a);
          }
        }
      }

      // Extract vitals if present
      if (rec.bp_systolic > 0 && !item.vitals.bp) {
        item.vitals.bp = `${rec.bp_systolic}/${rec.bp_diastolic || 80} mmHg`;
      }
      if (rec.heart_rate > 0 && !item.vitals.hr) {
        item.vitals.hr = `${rec.heart_rate} x/mnt`;
      }
      if (rec.temperature > 0 && !item.vitals.temp) {
        item.vitals.temp = `${rec.temperature} °C`;
      }
      if (rec.respiratory_rate > 0 && !item.vitals.rr) {
        item.vitals.rr = `${rec.respiratory_rate} x/mnt`;
      }
      if (rec.spo2 && rec.spo2 > 0 && !item.vitals.spo2) {
        item.vitals.spo2 = `${rec.spo2}%`;
      }
      if (rec.weight > 0 && !item.vitals.weight) {
        item.vitals.weight = `${rec.weight} kg`;
      }
      if (rec.height > 0 && !item.vitals.height) {
        item.vitals.height = `${rec.height} cm`;
      }
      if (rec.bmi && rec.bmi > 0 && !item.vitals.bmi) {
        item.vitals.bmi = `${rec.bmi.toFixed(1)}`;
      }
      if (rec.consciousness && !item.vitals.consciousness) {
        item.vitals.consciousness = rec.consciousness;
      }

      // Extract anamnesis
      if (rec.chief_complaint && !item.anamnesis.chiefComplaint) {
        item.anamnesis.chiefComplaint = rec.chief_complaint;
      }
      if (rec.history_of_present_illness && !item.anamnesis.historyOfPresentIllness) {
        item.anamnesis.historyOfPresentIllness = rec.history_of_present_illness;
      }
      if (rec.past_medical_history && !item.anamnesis.pastMedicalHistory) {
        item.anamnesis.pastMedicalHistory = rec.past_medical_history;
      }
      if (rec.allergy_notes && !item.anamnesis.allergyNotes) {
        item.anamnesis.allergyNotes = rec.allergy_notes;
      }

      // Extract examination / assessment
      if (rec.physical_examination && !item.physicalExamNotes) {
        const raw = rec.physical_examination.trim();
        if (raw.startsWith('{')) {
          try {
            const parsed = JSON.parse(raw);
            item.physicalExamNotes = parsed.keterangan_lain || 'Pemeriksaan fisik dalam batas normal';
          } catch {
            item.physicalExamNotes = raw;
          }
        } else {
          item.physicalExamNotes = raw;
        }
      }
      if (rec.assessment && !item.assessmentNotes) {
        item.assessmentNotes = rec.assessment;
      }
      if (rec.plan && !item.planNotes) {
        item.planNotes = rec.plan;
      }

      // Collect surat types
      if (rec.sheet_key === 'surat' || (rec.entry_group_key && rec.entry_group_key.startsWith('surat-'))) {
        const type = rec.entry_group_key || 'Surat';
        if (!item.suratTypes.includes(type)) {
          item.suratTypes.push(type);
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
    );
  }, [records, visit.id]);

  // Polyclinic list for filter
  const polyclinicOptions = useMemo(() => {
    const list = Array.from(new Set(groupedVisits.map((v) => v.polyclinicName).filter(Boolean)));
    return ['all', ...list];
  }, [groupedVisits]);

  // Filtered visits
  const filteredVisits = useMemo(() => {
    let result = groupedVisits;

    if (selectedPoli !== 'all') {
      result = result.filter((v) => v.polyclinicName === selectedPoli);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((v) => {
        const matchDoc = v.doctorName.toLowerCase().includes(q);
        const matchPoli = v.polyclinicName.toLowerCase().includes(q);
        const matchComplaint = (v.anamnesis.chiefComplaint || '').toLowerCase().includes(q);
        const matchIllness = (v.anamnesis.historyOfPresentIllness || '').toLowerCase().includes(q);
        const matchDiagnosis = v.diagnoses.some(
          (d) => d.code.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
        );
        const matchMedicine = v.prescriptions.some(
          (p) => (p.medicine?.name || '').toLowerCase().includes(q)
        );
        const matchAction = v.actions.some(
          (a) =>
            (a.service_name_snapshot || a.medical_service?.name || '').toLowerCase().includes(q) ||
            (a.service_code_snapshot || '').toLowerCase().includes(q) ||
            (a.notes || '').toLowerCase().includes(q)
        );
        return matchDoc || matchPoli || matchComplaint || matchIllness || matchDiagnosis || matchMedicine || matchAction;
      });
    }

    return result;
  }, [groupedVisits, selectedPoli, searchQuery]);

  // Toggle single visit expand
  const toggleExpand = (vId: number) => {
    setExpandedVisits((prev) => ({ ...prev, [vId]: !prev[vId] }));
  };

  // Expand / collapse all
  const handleToggleAll = (expand: boolean) => {
    const updated: Record<number, boolean> = {};
    groupedVisits.forEach((v) => {
      updated[v.visitId] = expand;
    });
    setExpandedVisits(updated);
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({
      title: 'Tersalin ke Clipboard',
      description: `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}" berhasil disalin.`,
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[95vw] sm:w-[85vw] lg:w-[80vw] max-w-[80vw] sm:max-w-[80vw] lg:max-w-[80vw] p-0 flex flex-col h-full bg-background border-l border-border shadow-2xl z-50 overflow-hidden"
      >
        {/* HEADER DRAWER (Fixed top) */}
        <div className="border-b border-border bg-card p-4 sm:p-5 shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-border bg-primary/10 text-primary shrink-0">
                <History className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-base sm:text-lg font-bold text-foreground">
                    Riwayat Rekam Medis Pasien
                  </SheetTitle>
                  <Badge variant="outline" className="font-mono text-xs rounded-none">
                    RM: {patient?.medical_record_number || '-'}
                  </Badge>
                  <Badge variant="secondary" className="rounded-none text-xs">
                    {filteredVisits.length} Kunjungan
                  </Badge>
                </div>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  Arsip longitudinal kunjungan, diagnosa ICD-10, tanda vital, tindakan, dan terapi obat terdahulu.
                </SheetDescription>
              </div>
            </div>

            {/* Quick action: Refresh */}
            <div className="flex items-center gap-2 pr-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-none text-xs shadow-none"
                onClick={loadHistory}
                disabled={loading}
                title="Muat ulang data riwayat"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                <span className="hidden sm:inline">Segarkan</span>
              </Button>
            </div>
          </div>

          {/* PATIENT VITAL BANNER */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 border border-border/80 bg-muted/20 p-2.5 text-xs">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Nama Pasien</span>
              <span className="font-bold text-foreground truncate block">{patient?.full_name || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Gender / Usia</span>
              <span className="font-medium text-foreground">{genderLabel}, {patientAge !== null ? `${patientAge} th` : '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">NIK</span>
              <span className="font-mono text-foreground">{patient?.nik || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Gol. Darah</span>
              <span className="font-semibold text-foreground">{patient?.blood_type || '-'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-destructive" />
                Riwayat Alergi
              </span>
              <span className={cn('font-semibold truncate block', patient?.allergies ? 'text-destructive' : 'text-muted-foreground')}>
                {patient?.allergies || 'Tidak ada riwayat alergi'}
              </span>
            </div>
          </div>

          {/* SEARCH & FILTER TOOLBAR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari diagnosis, tindakan, keluhan, obat, atau dokter..."
                  className="h-8 pl-8 text-xs rounded-none shadow-none bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Poli filter */}
              <select
                value={selectedPoli}
                onChange={(e) => setSelectedPoli(e.target.value)}
                className="h-8 border border-input bg-background px-2.5 text-xs rounded-none shadow-none focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Semua Poli ({groupedVisits.length})</option>
                {polyclinicOptions.filter((p) => p !== 'all').map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Expand / Collapse All */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => handleToggleAll(true)}
              >
                <Maximize2 className="h-3 w-3" />
                Buka Semua
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => handleToggleAll(false)}
              >
                <Minimize2 className="h-3 w-3" />
                Tutup Semua
              </Button>
            </div>
          </div>
        </div>

        {/* DRAWER BODY (Scrollable Timeline Feed) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-muted/5">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-medium">Memuat rekam medis pasien...</p>
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="py-20 border border-dashed border-border bg-card p-8 text-center space-y-2">
              <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <h4 className="text-sm font-bold text-foreground">Tidak Ditemukan Riwayat Rekam Medis</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery || selectedPoli !== 'all'
                  ? 'Tidak ada kunjungan yang cocok dengan filter atau kata kunci pencarian.'
                  : 'Pasien ini belum memiliki riwayat rekam medis dari kunjungan terdahulu.'}
              </p>
              {(searchQuery || selectedPoli !== 'all') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs rounded-none mt-2"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedPoli('all');
                  }}
                >
                  Reset Filter
                </Button>
              )}
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-5 before:absolute before:left-2 sm:before:left-3 before:top-3 before:bottom-3 before:w-[2px] before:bg-border/80">
              {filteredVisits.map((v, index) => {
                const isExpanded = Boolean(expandedVisits[v.visitId]);
                const hasVitals = Object.values(v.vitals).some(Boolean);
                const hasPrescriptions = v.prescriptions.length > 0 || v.compounds.length > 0;
                const hasActions = v.actions.length > 0;

                return (
                  <div key={v.visitId} className="relative group">
                    {/* Timeline Node Icon */}
                    <div
                      className={cn(
                        'absolute -left-6 sm:-left-8 top-3.5 h-5 w-5 sm:h-6 sm:w-6 border rounded-none flex items-center justify-center z-10 transition-colors',
                        v.isCurrentVisit
                          ? 'border-primary bg-primary text-primary-foreground font-bold text-[10px]'
                          : 'border-border bg-card text-muted-foreground group-hover:border-primary/60'
                      )}
                    >
                      {v.isCurrentVisit ? '★' : index + 1}
                    </div>

                    {/* CARD CONTAINER */}
                    <div
                      className={cn(
                        'border transition-all bg-card shadow-sm',
                        v.isCurrentVisit
                          ? 'border-primary/60 ring-1 ring-primary/20'
                          : 'border-border/80 hover:border-border'
                      )}
                    >
                      {/* CARD HEADER (Clickable to Toggle) */}
                      <div
                        className={cn(
                          'p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none transition-colors',
                          isExpanded ? 'bg-muted/20 border-b border-border/70' : 'hover:bg-muted/10'
                        )}
                        onClick={() => toggleExpand(v.visitId)}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-primary" />
                              {formatDateTime(v.visitDate)}
                            </span>
                            <Badge variant="outline" className="rounded-none text-[10px] font-mono">
                              #{v.visitNumber}
                            </Badge>
                            <Badge className="rounded-none bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold">
                              {v.polyclinicName}
                            </Badge>
                            {v.isCurrentVisit && (
                              <Badge className="rounded-none bg-emerald-600 text-white text-[10px] uppercase font-bold">
                                Kunjungan Ini
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Stethoscope className="h-3 w-3 text-muted-foreground" />
                              dr. {v.doctorName}
                            </span>
                            <span>•</span>
                            <span>Penjamin: {v.paymentType}</span>
                            {v.queueNumber ? (
                              <>
                                <span>•</span>
                                <span className="font-mono">Antrian #{v.queueNumber}</span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {/* Top Summary Badges & Toggle Arrow */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {v.diagnoses.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                              {v.diagnoses.slice(0, 2).map((d) => (
                                <Badge
                                  key={d.code}
                                  variant="secondary"
                                  className="rounded-none text-[10px] font-mono py-0 h-5 border border-border/80"
                                  title={`${d.code} - ${d.description}`}
                                >
                                  {d.code}
                                </Badge>
                              ))}
                              {v.diagnoses.length > 2 && (
                                <Badge variant="outline" className="rounded-none text-[10px] py-0 h-5">
                                  +{v.diagnoses.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}

                          {hasActions && (
                            <Badge
                              variant="outline"
                              className="rounded-none text-[10px] py-0 h-5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 font-medium"
                            >
                              {v.actions.length} Tindakan
                            </Badge>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-none text-muted-foreground"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* CARD BODY (Shown when Expanded) */}
                      {isExpanded && (
                        <div className="p-3.5 sm:p-5 space-y-4 text-xs divide-y divide-border/60">
                          {/* 1. DIAGNOSA ICD-10 */}
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-primary" />
                                Diagnosis Pasien
                              </span>
                              {v.diagnoses.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const text = v.diagnoses.map((d) => `${d.code} - ${d.description}`).join(', ');
                                    handleCopy(text, `diag-${v.visitId}`);
                                  }}
                                >
                                  {copiedId === `diag-${v.visitId}` ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Salin Diagnosis
                                </Button>
                              )}
                            </span>

                            {v.diagnoses.length === 0 ? (
                              <p className="text-muted-foreground italic">Belum ada entri diagnosis tercatat.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {v.diagnoses.map((diag) => (
                                  <div
                                    key={diag.code}
                                    className="flex items-start gap-2 p-2 border border-border/70 bg-muted/10"
                                  >
                                    <Badge
                                      variant={diag.isPrimary ? 'default' : 'outline'}
                                      className="rounded-none font-mono text-[11px] shrink-0 font-bold"
                                    >
                                      {diag.code}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-foreground text-xs leading-snug">
                                        {diag.description}
                                      </p>
                                      <span className="text-[10px] text-muted-foreground uppercase">
                                        {diag.isPrimary ? 'Diagnosis Utama (Primer)' : 'Diagnosis Sekunder / Komplikasi'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 2. TANDA VITAL */}
                          {hasVitals && (
                            <div className="pt-3 space-y-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <HeartPulse className="h-3.5 w-3.5 text-primary" />
                                Tanda Vital & Pengukuran
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                {v.vitals.bp && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Tekanan Darah</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.bp}</span>
                                  </div>
                                )}
                                {v.vitals.hr && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Nadi</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.hr}</span>
                                  </div>
                                )}
                                {v.vitals.temp && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Suhu Tubuh</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.temp}</span>
                                  </div>
                                )}
                                {v.vitals.rr && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Pernapasan</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.rr}</span>
                                  </div>
                                )}
                                {v.vitals.spo2 && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">SpO2</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.spo2}</span>
                                  </div>
                                )}
                                {v.vitals.weight && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Berat / TB</span>
                                    <span className="font-bold text-foreground text-xs">
                                      {v.vitals.weight} {v.vitals.height ? `• ${v.vitals.height}` : ''}
                                    </span>
                                  </div>
                                )}
                                {v.vitals.consciousness && (
                                  <div className="border border-border/80 bg-muted/20 p-2">
                                    <span className="text-[10px] text-muted-foreground block font-medium">Kesadaran</span>
                                    <span className="font-bold text-foreground text-xs">{v.vitals.consciousness}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 3. KELUHAN & ANAMNESIS */}
                          {(v.anamnesis.chiefComplaint || v.anamnesis.historyOfPresentIllness || v.anamnesis.pastMedicalHistory) && (
                            <div className="pt-3 space-y-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="h-3.5 w-3.5 text-primary" />
                                  Keluhan & Anamnesis (S)
                                </span>
                                {v.anamnesis.chiefComplaint && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopy(v.anamnesis.chiefComplaint!, `keluhan-${v.visitId}`);
                                    }}
                                  >
                                    {copiedId === `keluhan-${v.visitId}` ? (
                                      <Check className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    Salin Keluhan
                                  </Button>
                                )}
                              </span>

                              <div className="space-y-2 bg-muted/10 p-3 border border-border/70">
                                {v.anamnesis.chiefComplaint && (
                                  <div>
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                                      Keluhan Utama
                                    </span>
                                    <p className="text-foreground leading-relaxed font-medium">
                                      {v.anamnesis.chiefComplaint}
                                    </p>
                                  </div>
                                )}
                                {v.anamnesis.historyOfPresentIllness && (
                                  <div>
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                                      Riwayat Penyakit Sekarang (RPS)
                                    </span>
                                    <p className="text-foreground leading-relaxed">
                                      {v.anamnesis.historyOfPresentIllness}
                                    </p>
                                  </div>
                                )}
                                {v.anamnesis.pastMedicalHistory && (
                                  <div>
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                                      Riwayat Penyakit Dahulu (RPD)
                                    </span>
                                    <p className="text-foreground leading-relaxed">
                                      {v.anamnesis.pastMedicalHistory}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 4. PEMERIKSAAN FISIK & CATATAN KLINIS */}
                          {(v.physicalExamNotes || v.assessmentNotes || v.planNotes) && (
                            <div className="pt-3 space-y-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 text-primary" />
                                Temuan Fisik & Rencana (O / A / P)
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {v.physicalExamNotes && (
                                  <div className="p-2.5 border border-border/70 bg-muted/10">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                                      Pemeriksaan Fisik
                                    </span>
                                    <p className="text-foreground mt-0.5 leading-relaxed">{v.physicalExamNotes}</p>
                                  </div>
                                )}
                                {v.planNotes && (
                                  <div className="p-2.5 border border-border/70 bg-muted/10">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                                      Instruksi / Rencana Tindak Lanjut
                                    </span>
                                    <p className="text-foreground mt-0.5 leading-relaxed">{v.planNotes}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 5. TINDAKAN MEDIS & OPERASI KECIL */}
                          <div className="pt-3 space-y-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Syringe className="h-3.5 w-3.5 text-primary" />
                                Tindakan Medis / Prosedur ({v.actions.length} Tindakan)
                              </span>
                              {hasActions && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const actList = v.actions
                                      .map(
                                        (a) =>
                                          `${a.service_name_snapshot || a.medical_service?.name || 'Tindakan'} (${a.service_code_snapshot || '-'}) x${a.quantity || 1}${a.notes ? ` - ${a.notes}` : ''}`
                                      )
                                      .join('\n');
                                    handleCopy(actList, `act-${v.visitId}`);
                                  }}
                                >
                                  {copiedId === `act-${v.visitId}` ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Salin Tindakan
                                </Button>
                              )}
                            </span>

                            {!hasActions ? (
                              <p className="text-muted-foreground italic">Tidak ada tindakan medis tercatat pada kunjungan ini.</p>
                            ) : (
                              <div className="border border-border/80 divide-y divide-border/60 overflow-hidden">
                                {v.actions.map((act) => {
                                  const actionName = act.service_name_snapshot || act.medical_service?.name || 'Tindakan Medis';
                                  const actionCode = act.service_code_snapshot || act.medical_service?.code || '';
                                  const targets = act.targets || [];

                                  return (
                                    <div key={act.id} className="p-2.5 flex items-start justify-between gap-3 bg-muted/5 hover:bg-muted/15 transition-colors">
                                      <div className="space-y-1">
                                        <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                                          <Syringe className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                          {actionName}
                                          {actionCode && (
                                            <Badge variant="outline" className="font-mono text-[10px] py-0 h-4 font-normal">
                                              {actionCode}
                                            </Badge>
                                          )}
                                        </p>

                                        {act.notes && (
                                          <p className="text-muted-foreground text-[11px] leading-snug">
                                            Catatan: <span className="text-foreground">{act.notes}</span>
                                          </p>
                                        )}

                                        {targets.length > 0 && (
                                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                            <span className="text-[10px] text-muted-foreground font-medium">Elemen / Lokasi:</span>
                                            {targets.map((t, idx) => {
                                              const label = t.tooth_number
                                                ? `Gigi ${t.tooth_number}${t.surface_codes && t.surface_codes.length > 0 ? ` (${t.surface_codes.join(',')})` : ''}`
                                                : t.quadrant
                                                  ? `Kuadran ${t.quadrant}`
                                                  : t.arch
                                                    ? `Rahang ${t.arch}`
                                                    : t.notes || 'Target Prosedur';
                                              return (
                                                <Badge key={idx} variant="secondary" className="rounded-none font-mono text-[10px] py-0 h-4">
                                                  {label}
                                                </Badge>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <Badge variant="secondary" className="font-mono text-xs font-bold rounded-none shrink-0">
                                        Qty: {act.quantity || 1}
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* 6. RESEP OBAT / TERAPI */}
                          <div className="pt-3 space-y-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Pill className="h-3.5 w-3.5 text-primary" />
                                Terapi & Resep Obat ({v.prescriptions.length + v.compounds.length} Item)
                              </span>
                              {hasPrescriptions && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rxList = v.prescriptions
                                      .map((p) => `${p.medicine?.name || 'Obat'} ${p.dosage || ''} (${p.instructions || p.frequency || ''}) Qty: ${p.quantity}`)
                                      .join('\n');
                                    handleCopy(rxList, `rx-${v.visitId}`);
                                  }}
                                >
                                  {copiedId === `rx-${v.visitId}` ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Salin Daftar Obat
                                </Button>
                              )}
                            </span>

                            {!hasPrescriptions ? (
                              <p className="text-muted-foreground italic">Tidak ada resep obat pada kunjungan ini.</p>
                            ) : (
                              <div className="border border-border/80 divide-y divide-border/60 overflow-hidden">
                                {v.prescriptions.map((p) => (
                                  <div key={p.id} className="p-2.5 flex items-start justify-between gap-3 bg-muted/5 hover:bg-muted/15 transition-colors">
                                    <div className="space-y-0.5">
                                      <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                                        <Pill className="h-3 w-3 text-primary shrink-0" />
                                        {p.medicine?.name || 'Nama Obat'}
                                        {p.medicine?.form && (
                                          <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal">
                                            {p.medicine.form}
                                          </Badge>
                                        )}
                                      </p>
                                      <p className="text-muted-foreground text-[11px]">
                                        Dosis: <span className="text-foreground font-medium">{p.dosage || '-'}</span> •
                                        Aturan: <span className="text-foreground font-medium">{p.frequency || p.instructions || '-'}</span>
                                        {p.route ? ` (${p.route})` : ''}
                                      </p>
                                      {p.notes && (
                                        <p className="text-muted-foreground text-[10px] italic">
                                          Catatan: {p.notes}
                                        </p>
                                      )}
                                    </div>
                                    <Badge variant="secondary" className="font-mono text-xs font-bold rounded-none shrink-0">
                                      Qty: {p.quantity}
                                    </Badge>
                                  </div>
                                ))}

                                {v.compounds.map((c) => (
                                  <div key={c.id} className="p-2.5 bg-amber-500/5 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <p className="font-bold text-amber-700 dark:text-amber-400 text-xs flex items-center gap-1.5">
                                        <Layers className="h-3 w-3" />
                                        {c.name || 'Racikan'} ({c.preparation_type || 'Puyer'})
                                      </p>
                                      <Badge variant="outline" className="font-mono text-xs rounded-none">
                                        Qty: {c.output_quantity || 1} {c.output_unit || 'Bungkus'}
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      Aturan: <span className="text-foreground font-medium">{c.instructions || c.frequency || '-'}</span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 7. SURAT / DOKUMEN KLINIS TERBIT */}
                          {v.suratTypes.length > 0 && (
                            <div className="pt-3 space-y-1.5">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                                Surat Medis yang Diterbitkan
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {v.suratTypes.map((st) => (
                                  <Badge key={st} variant="outline" className="rounded-none bg-muted/20 text-xs capitalize">
                                    {st.replace('surat-', 'Surat ')}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
