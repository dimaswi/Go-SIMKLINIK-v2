import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  medicalRecordsApi,
  icd10Api,
  medicinesApi,
  medicalServicesApi,
  type MedicalRecord,
  type ICD10,
  type Medicine,
  type MedicalService,
  type MedicalRecordDiagnosis,
  type Prescription,
  type MedicalActionItem,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  History,
  Loader2,
  Lock,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  User,
} from 'lucide-react';

type TabKey = 'subjective' | 'objective' | 'assessment' | 'plan';

type EMRFormState = {
  chief_complaint: string;
  history_of_present_illness: string;
  clinical_alert: string;
  allergy_notes: string;
  subjective: string;
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  spo2: number;
  pain_scale: number;
  consciousness: string;
  height: number;
  weight: number;
  physical_examination: string;
  assessment: string;
  plan: string;
  follow_up_instruction: string;
  follow_up_at: string;
  notes: string;
};

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'subjective', label: 'Subjective', icon: User },
  { key: 'objective', label: 'Objective', icon: Activity },
  { key: 'assessment', label: 'Assessment', icon: Stethoscope },
  { key: 'plan', label: 'Plan', icon: ClipboardList },
];

const INITIAL_FORM: EMRFormState = {
  chief_complaint: '',
  history_of_present_illness: '',
  clinical_alert: '',
  allergy_notes: '',
  subjective: '',
  bp_systolic: 0,
  bp_diastolic: 0,
  heart_rate: 0,
  temperature: 0,
  respiratory_rate: 0,
  spo2: 0,
  pain_scale: 0,
  consciousness: 'compos mentis',
  height: 0,
  weight: 0,
  physical_examination: '',
  assessment: '',
  plan: '',
  follow_up_instruction: '',
  follow_up_at: '',
  notes: '',
};

function formatDateTimeLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatFullDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function calculateAge(value?: string) {
  if (!value) return null;
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function getBMI(weight: number, height: number) {
  if (weight <= 0 || height <= 0) return 0;
  const heightM = height / 100;
  return Number((weight / (heightM * heightM)).toFixed(1));
}

function getBMIStatus(bmi: number) {
  if (!bmi) return 'Belum dihitung';
  if (bmi < 18.5) return 'Kurus';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Berlebih';
  return 'Obesitas';
}

function DenseStat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={alert ? 'mt-1 text-sm font-semibold text-destructive' : 'mt-1 text-sm font-semibold'}>{value}</p>
    </div>
  );
}

function SectionTitle({ title, helper }: { title: string; helper?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function SubjectivePane({
  chiefComplaint,
  historyOfPresentIllness,
  clinicalAlert,
  allergyNotes,
  subjective,
  complaint,
  patientAllergies,
  onChange,
  readOnly,
}: {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  clinicalAlert: string;
  allergyNotes: string;
  subjective: string;
  complaint: string;
  patientAllergies: string;
  onChange: (field: 'chief_complaint' | 'history_of_present_illness' | 'clinical_alert' | 'allergy_notes' | 'subjective', value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <SectionTitle title="Keluhan Utama" helper="Masalah utama yang membawa pasien datang hari ini." />
            <Textarea
              value={chiefComplaint}
              onChange={(event) => onChange('chief_complaint', event.target.value)}
              placeholder="Contoh: demam 3 hari, batuk berdahak, nyeri tenggorokan."
              rows={4}
              disabled={readOnly}
            />
          </div>
          <div>
            <SectionTitle title="Alert Klinis" helper="Red flag, komorbid penting, risiko tinggi, atau perhatian khusus." />
            <Textarea
              value={clinicalAlert}
              onChange={(event) => onChange('clinical_alert', event.target.value)}
              placeholder="Contoh: riwayat asma, hamil trimester 2, alergi berat penisilin."
              rows={4}
              disabled={readOnly}
            />
          </div>
        </div>

        <div>
          <SectionTitle title="Riwayat Penyakit Sekarang" helper="Kronologi keluhan, gejala penyerta, terapi sebelumnya, dan responsnya." />
          <Textarea
            value={historyOfPresentIllness}
            onChange={(event) => onChange('history_of_present_illness', event.target.value)}
            placeholder="Tuliskan onset, durasi, progresivitas, faktor pencetus/peringan, terapi yang sudah dicoba, dan red flags yang disangkal."
            rows={8}
            disabled={readOnly}
          />
        </div>

        <div>
          <SectionTitle title="Catatan Subjektif Tambahan" helper="Keluhan penyerta, riwayat obat, riwayat penyakit dahulu, kebiasaan, dan konteks lain." />
          <Textarea
            value={subjective}
            onChange={(event) => onChange('subjective', event.target.value)}
            placeholder="Tambahkan konteks subjektif lain yang tidak masuk di riwayat penyakit sekarang."
            rows={8}
            disabled={readOnly}
          />
        </div>

        <div>
          <SectionTitle title="Alergi / Reaksi Obat" helper="Khusus untuk kunjungan ini bila ada detail yang perlu ditegaskan." />
          <Textarea
            value={allergyNotes}
            onChange={(event) => onChange('allergy_notes', event.target.value)}
            placeholder="Contoh: amoksisilin menyebabkan gatal menyeluruh, NSAID memperberat gastritis."
            rows={4}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keluhan Pendaftaran</p>
          <p className="mt-2 text-sm leading-6">{complaint || 'Tidak ada keluhan awal.'}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alergi Pasien</p>
          <p className="mt-2 text-sm leading-6">{patientAllergies || 'Belum ada alergi pada master pasien.'}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Checklist cepat</p>
          <ul className="mt-2 space-y-2">
            <li>Keluhan utama sudah tegas</li>
            <li>Riwayat penyakit sekarang lengkap</li>
            <li>Alergi dan red flags sudah dicek</li>
            <li>Riwayat obat / terapi sebelumnya tercatat</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ObjectivePane({
  form,
  onChange,
  readOnly,
}: {
  form: EMRFormState;
  onChange: (field: keyof EMRFormState, value: number | string) => void;
  readOnly: boolean;
}) {
  const bmi = getBMI(form.weight, form.height);

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle title="Tanda Vital" helper="Isi seperlunya. Tidak perlu dipisah ke banyak panel." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <div>
            <Label className="text-xs">TD Sistolik</Label>
            <Input type="number" value={form.bp_systolic || ''} onChange={(event) => onChange('bp_systolic', parseInt(event.target.value, 10) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">TD Diastolik</Label>
            <Input type="number" value={form.bp_diastolic || ''} onChange={(event) => onChange('bp_diastolic', parseInt(event.target.value, 10) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">Nadi</Label>
            <Input type="number" value={form.heart_rate || ''} onChange={(event) => onChange('heart_rate', parseInt(event.target.value, 10) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">Suhu</Label>
            <Input type="number" step="0.1" value={form.temperature || ''} onChange={(event) => onChange('temperature', parseFloat(event.target.value) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">RR</Label>
            <Input type="number" value={form.respiratory_rate || ''} onChange={(event) => onChange('respiratory_rate', parseInt(event.target.value, 10) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">SpO2</Label>
            <Input type="number" step="0.1" value={form.spo2 || ''} onChange={(event) => onChange('spo2', parseFloat(event.target.value) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">Skala Nyeri</Label>
            <Input type="number" min={0} max={10} value={form.pain_scale || ''} onChange={(event) => onChange('pain_scale', parseInt(event.target.value, 10) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">Kesadaran</Label>
            <SearchableSelect
              options={[
                { value: 'compos mentis', label: 'Compos Mentis' },
                { value: 'somnolen', label: 'Somnolen' },
                { value: 'sopor', label: 'Sopor' },
                { value: 'coma', label: 'Coma' },
              ]}
              value={form.consciousness}
              onValueChange={(value) => onChange('consciousness', value)}
              placeholder="Pilih kesadaran"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <SectionTitle title="Pemeriksaan Fisik" />
          <Textarea
            value={form.physical_examination}
            onChange={(event) => onChange('physical_examination', event.target.value)}
            placeholder="Tulis temuan pemeriksaan fisik yang relevan."
            rows={12}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-3 rounded-lg border p-3">
          <SectionTitle title="Antropometri" />
          <div>
            <Label className="text-xs">Tinggi Badan (cm)</Label>
            <Input type="number" step="0.1" value={form.height || ''} onChange={(event) => onChange('height', parseFloat(event.target.value) || 0)} disabled={readOnly} />
          </div>
          <div>
            <Label className="text-xs">Berat Badan (kg)</Label>
            <Input type="number" step="0.1" value={form.weight || ''} onChange={(event) => onChange('weight', parseFloat(event.target.value) || 0)} disabled={readOnly} />
          </div>
          <Separator />
          <DenseStat label="BMI" value={bmi ? String(bmi) : '-'} alert={bmi >= 30} />
          <DenseStat label="Status" value={getBMIStatus(bmi)} alert={bmi >= 30} />
          <DenseStat label="Nyeri" value={form.pain_scale ? `${form.pain_scale}/10` : '-'} alert={form.pain_scale >= 7} />
          <DenseStat label="Kesadaran" value={form.consciousness || '-'} />
        </div>
      </div>
    </div>
  );
}

function AssessmentPane({
  assessment,
  diagnoses,
  icd10List,
  onAssessmentChange,
  onAddDiagnosis,
  onDeleteDiagnosis,
  readOnly,
}: {
  assessment: string;
  diagnoses: MedicalRecordDiagnosis[];
  icd10List: ICD10[];
  onAssessmentChange: (value: string) => void;
  onAddDiagnosis: (icd10Id: number, type: 'primer' | 'sekunder') => void;
  onDeleteDiagnosis: (id: number) => void;
  readOnly: boolean;
}) {
  const [selectedICD, setSelectedICD] = useState('');
  const [diagType, setDiagType] = useState<'primer' | 'sekunder'>('primer');

  const icdOptions = icd10List.map((item) => ({
    value: String(item.id),
    label: `${item.code} — ${item.name_id || item.name}`,
  }));

  const handleAdd = () => {
    if (!selectedICD) return;
    onAddDiagnosis(parseInt(selectedICD, 10), diagType);
    setSelectedICD('');
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle title="Penilaian Klinis" helper="Isi kesimpulan klinis dan differential diagnosis bila perlu." />
        <Textarea
          value={assessment}
          onChange={(event) => onAssessmentChange(event.target.value)}
          placeholder="Contoh: ISPA, dd bronkitis akut, kondisi umum baik, tidak ada tanda distress napas."
          rows={8}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle title="Diagnosis Tercatat" />
          <div className="space-y-2">
            {diagnoses.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Belum ada diagnosis.</div>
            ) : (
              diagnoses.map((diagnosis) => (
                <div key={diagnosis.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={diagnosis.diagnosis_type === 'primer' ? 'default' : 'secondary'}>
                        {diagnosis.diagnosis_type === 'primer' ? 'Primer' : 'Sekunder'}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{diagnosis.icd10?.code || '-'}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{diagnosis.icd10?.name_id || diagnosis.icd10?.name || '-'}</p>
                  </div>
                  {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDeleteDiagnosis(diagnosis.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <SectionTitle title="Tambah Diagnosis" />
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cari ICD-10</Label>
              <SearchableSelect
                options={icdOptions}
                value={selectedICD}
                onValueChange={setSelectedICD}
                placeholder="Cari diagnosis..."
                searchPlaceholder="Kode atau nama diagnosis"
              />
            </div>
            <div>
              <Label className="text-xs">Tipe</Label>
              <SearchableSelect
                options={[
                  { value: 'primer', label: 'Primer' },
                  { value: 'sekunder', label: 'Sekunder' },
                ]}
                value={diagType}
                onValueChange={(value) => setDiagType((value as 'primer' | 'sekunder') || 'primer')}
                placeholder="Pilih tipe"
              />
            </div>
            <Button className="w-full gap-1.5" size="sm" onClick={handleAdd} disabled={!selectedICD || readOnly}>
              <Plus className="h-4 w-4" /> Tambah Diagnosis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanPane({
  plan,
  followUpInstruction,
  followUpAt,
  notes,
  prescriptions,
  actions,
  medicineList,
  serviceList,
  onPlanChange,
  onFollowUpInstructionChange,
  onFollowUpAtChange,
  onNotesChange,
  onAddPrescription,
  onDeletePrescription,
  onAddAction,
  onDeleteAction,
  readOnly,
}: {
  plan: string;
  followUpInstruction: string;
  followUpAt: string;
  notes: string;
  prescriptions: Prescription[];
  actions: MedicalActionItem[];
  medicineList: Medicine[];
  serviceList: MedicalService[];
  onPlanChange: (value: string) => void;
  onFollowUpInstructionChange: (value: string) => void;
  onFollowUpAtChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onAddPrescription: (data: { medicine_id: number; quantity: number; dosage: string; frequency: string; duration: string; route: string; instructions: string }) => void;
  onDeletePrescription: (id: number) => void;
  onAddAction: (data: { medical_service_id: number; quantity: number; notes: string }) => void;
  onDeleteAction: (id: number) => void;
  readOnly: boolean;
}) {
  const [selectedMedicine, setSelectedMedicine] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [prescriptionForm, setPrescriptionForm] = useState({
    quantity: 1,
    dosage: '',
    frequency: '',
    duration: '',
    route: 'oral',
    instructions: '',
  });
  const [actionNotes, setActionNotes] = useState('');

  const medicineOptions = medicineList.map((medicine) => ({
    value: String(medicine.id),
    label: `${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''}`,
  }));

  const serviceOptions = serviceList.map((service) => ({
    value: String(service.id),
    label: `${service.name} — Rp ${service.price.toLocaleString('id-ID')}`,
  }));

  const handleAddPrescription = () => {
    if (!selectedMedicine) return;
    onAddPrescription({ medicine_id: parseInt(selectedMedicine, 10), ...prescriptionForm });
    setSelectedMedicine('');
    setPrescriptionForm({ quantity: 1, dosage: '', frequency: '', duration: '', route: 'oral', instructions: '' });
  };

  const handleAddAction = () => {
    if (!selectedService) return;
    onAddAction({ medical_service_id: parseInt(selectedService, 10), quantity: 1, notes: actionNotes });
    setSelectedService('');
    setActionNotes('');
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle title="Rencana Terapi" />
        <Textarea value={plan} onChange={(event) => onPlanChange(event.target.value)} rows={6} disabled={readOnly} placeholder="Rencana obat, edukasi, follow-up, kontrol ulang, atau instruksi khusus." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <SectionTitle title="Instruksi Pulang / Follow-up" helper="Edukasi pasien, warning sign, dan kapan harus kembali." />
          <Textarea
            value={followUpInstruction}
            onChange={(event) => onFollowUpInstructionChange(event.target.value)}
            rows={5}
            disabled={readOnly}
            placeholder="Contoh: minum obat sampai habis, kontrol 3 hari bila demam tidak turun, segera ke IGD bila sesak."
          />
        </div>
        <div className="rounded-lg border p-3">
          <SectionTitle title="Kontrol Ulang" />
          <div>
            <Label className="text-xs">Jadwal Kontrol</Label>
            <Input type="datetime-local" value={followUpAt} onChange={(event) => onFollowUpAtChange(event.target.value)} disabled={readOnly} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border p-3">
          <SectionTitle title="Resep Obat" />
          <div className="space-y-2">
            {prescriptions.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Belum ada resep.</div>
            ) : (
              prescriptions.map((prescription) => (
                <div key={prescription.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{prescription.medicine?.name || '-'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(' · ') || 'Belum lengkap'} · Qty {prescription.quantity}</p>
                    {prescription.instructions && <p className="mt-1 text-xs text-muted-foreground">{prescription.instructions}</p>}
                  </div>
                  {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDeletePrescription(prescription.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {!readOnly && (
            <div className="mt-3 space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs">Obat</Label>
                <SearchableSelect options={medicineOptions} value={selectedMedicine} onValueChange={setSelectedMedicine} placeholder="Pilih obat" searchPlaceholder="Cari obat" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min={1} value={prescriptionForm.quantity} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, quantity: parseInt(event.target.value, 10) || 1 }))} />
                </div>
                <div>
                  <Label className="text-xs">Dosis</Label>
                  <Input value={prescriptionForm.dosage} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, dosage: event.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Frekuensi</Label>
                  <Input value={prescriptionForm.frequency} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, frequency: event.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Durasi</Label>
                  <Input value={prescriptionForm.duration} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, duration: event.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Rute</Label>
                  <SearchableSelect
                    options={[
                      { value: 'oral', label: 'Oral' },
                      { value: 'topikal', label: 'Topikal' },
                      { value: 'injeksi', label: 'Injeksi' },
                      { value: 'inhalasi', label: 'Inhalasi' },
                    ]}
                    value={prescriptionForm.route}
                    onValueChange={(value) => setPrescriptionForm((prev) => ({ ...prev, route: value }))}
                    placeholder="Rute"
                  />
                </div>
                <div className="sm:col-span-2 xl:col-span-3">
                  <Label className="text-xs">Aturan Pakai</Label>
                  <Input value={prescriptionForm.instructions} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, instructions: event.target.value }))} placeholder="Sesudah makan" />
                </div>
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={handleAddPrescription} disabled={!selectedMedicine}>
                <Plus className="h-4 w-4" /> Tambah Resep
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <SectionTitle title="Tindakan dan Catatan" />
          <div className="space-y-2">
            {actions.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Belum ada tindakan.</div>
            ) : (
              actions.map((action) => (
                <div key={action.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{action.medical_service?.name || '-'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Rp {action.price.toLocaleString('id-ID')} × {action.quantity}</p>
                    {action.notes && <p className="mt-1 text-xs text-muted-foreground">{action.notes}</p>}
                  </div>
                  {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDeleteAction(action.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {!readOnly && (
            <div className="mt-3 space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs">Layanan / Tindakan</Label>
                <SearchableSelect options={serviceOptions} value={selectedService} onValueChange={setSelectedService} placeholder="Pilih tindakan" searchPlaceholder="Cari layanan" />
              </div>
              <div>
                <Label className="text-xs">Catatan</Label>
                <Input value={actionNotes} onChange={(event) => setActionNotes(event.target.value)} placeholder="Catatan tindakan" />
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={handleAddAction} disabled={!selectedService}>
                <Plus className="h-4 w-4" /> Tambah Tindakan
              </Button>
            </div>
          )}

          <Separator className="my-3" />

          <div>
            <Label className="text-sm font-medium">Catatan Tambahan</Label>
            <Textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={6} disabled={readOnly} className="mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EMRForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('subjective');
  const [form, setForm] = useState<EMRFormState>(INITIAL_FORM);
  const [icd10List, setIcd10List] = useState<ICD10[]>([]);
  const [medicineList, setMedicineList] = useState<Medicine[]>([]);
  const [serviceList, setServiceList] = useState<MedicalService[]>([]);
  const [historyRecords, setHistoryRecords] = useState<MedicalRecord[]>([]);

  const readOnly = record?.status === 'final';

  const loadRecord = useCallback(async () => {
    try {
      const response = await medicalRecordsApi.getById(Number(id));
      const data: MedicalRecord = response.data.data;
      setRecord(data);
      setForm({
        chief_complaint: data.chief_complaint || data.visit?.complaint || '',
        history_of_present_illness: data.history_of_present_illness || '',
        clinical_alert: data.clinical_alert || '',
        allergy_notes: data.allergy_notes || data.patient?.allergies || '',
        subjective: data.subjective || '',
        bp_systolic: data.bp_systolic || 0,
        bp_diastolic: data.bp_diastolic || 0,
        heart_rate: data.heart_rate || 0,
        temperature: data.temperature || 0,
        respiratory_rate: data.respiratory_rate || 0,
        spo2: data.spo2 || 0,
        pain_scale: data.pain_scale || 0,
        consciousness: data.consciousness || 'compos mentis',
        height: data.height || 0,
        weight: data.weight || 0,
        physical_examination: data.physical_examination || '',
        assessment: data.assessment || '',
        plan: data.plan || '',
        follow_up_instruction: data.follow_up_instruction || '',
        follow_up_at: formatDateTimeLocal(data.follow_up_at),
        notes: data.notes || '',
      });
      setPageTitle(`Rekam Medis — ${data.patient?.full_name || ''}`);
    } catch {
      toast({ variant: 'destructive', title: 'Rekam medis tidak ditemukan' });
      navigate('/emr');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    loadRecord();
    icd10Api.search('per_page=5000').then((response) => setIcd10List(response.data.data || []));
    medicinesApi.getAll('per_page=500&is_active=true').then((response) => setMedicineList(response.data.data || []));
    medicalServicesApi.getAll('per_page=500&is_active=true').then((response) => setServiceList(response.data.data || []));
  }, [loadRecord]);

  useEffect(() => {
    if (!record?.patient_id) return;
    medicalRecordsApi
      .getByPatient(record.patient_id)
      .then((response) => {
        const items: MedicalRecord[] = response.data.data || [];
        setHistoryRecords(items.filter((item) => item.id !== record.id).slice(0, 5));
      })
      .catch(() => setHistoryRecords([]));
  }, [record?.id, record?.patient_id]);

  const handleFieldChange = (field: keyof EMRFormState, value: number | string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const response = await medicalRecordsApi.update(record.id, form);
      setRecord(response.data.data);
      toast({ title: 'Rekam medis berhasil disimpan' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: error.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await medicalRecordsApi.update(record.id, form);
      await medicalRecordsApi.finalize(record.id);
      toast({ title: 'Rekam medis berhasil di-finalisasi' });
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal finalisasi', description: error.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDiagnosis = async (icd10Id: number, type: 'primer' | 'sekunder') => {
    if (!record) return;
    try {
      await medicalRecordsApi.addDiagnosis(record.id, { icd10_id: icd10Id, diagnosis_type: type });
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah diagnosis', description: error.response?.data?.error });
    }
  };

  const handleDeleteDiagnosis = async (diagnosisId: number) => {
    if (!record) return;
    try {
      await medicalRecordsApi.deleteDiagnosis(record.id, diagnosisId);
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus diagnosis', description: error.response?.data?.error });
    }
  };

  const handleAddPrescription = async (data: { medicine_id: number; quantity: number; dosage: string; frequency: string; duration: string; route: string; instructions: string }) => {
    if (!record) return;
    try {
      await medicalRecordsApi.addPrescription(record.id, data);
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah resep', description: error.response?.data?.error });
    }
  };

  const handleDeletePrescription = async (prescriptionId: number) => {
    if (!record) return;
    try {
      await medicalRecordsApi.deletePrescription(record.id, prescriptionId);
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus resep', description: error.response?.data?.error });
    }
  };

  const handleAddAction = async (data: { medical_service_id: number; quantity: number; notes: string }) => {
    if (!record) return;
    try {
      await medicalRecordsApi.addAction(record.id, data);
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah tindakan', description: error.response?.data?.error });
    }
  };

  const handleDeleteAction = async (actionId: number) => {
    if (!record) return;
    try {
      await medicalRecordsApi.deleteAction(record.id, actionId);
      await loadRecord();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus tindakan', description: error.response?.data?.error });
    }
  };

  const patient = record?.patient;
  const visit = record?.visit;
  const age = calculateAge(patient?.birth_date);
  const bmi = getBMI(form.weight, form.height);

  const completion = useMemo(() => ({
    subjective: Boolean(form.chief_complaint.trim() || form.history_of_present_illness.trim() || form.subjective.trim()),
    objective: Boolean(form.physical_examination.trim() || form.bp_systolic || form.temperature || form.heart_rate || form.pain_scale || form.consciousness.trim()),
    assessment: Boolean(form.assessment.trim() || record?.diagnoses?.length),
    plan: Boolean(form.plan.trim() || form.follow_up_instruction.trim() || form.follow_up_at || record?.prescriptions?.length || record?.actions?.length),
  }), [form, record?.actions?.length, record?.diagnoses?.length, record?.prescriptions?.length]);

  const completedCount = Object.values(completion).filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!record) return null;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate('/emr')} className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Badge variant={record.status === 'final' ? 'default' : 'secondary'}>
              {record.status === 'final' ? 'Final' : 'Draft'}
            </Badge>
            <Badge variant="outline">{visit?.visit_number || '-'}</Badge>
          </div>
          <p className="text-sm font-semibold">{patient?.full_name || '-'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatFullDate(record.record_date)} · Dr. {record.doctor?.full_name || '-'} · {record.polyclinic?.name || '-'}</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
            <Button onClick={handleFinalize} disabled={saving} className="gap-1.5">
              <Lock className="h-4 w-4" /> Finalisasi
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-xl border bg-card">
          <div className="border-b px-3 py-2.5">
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={active ? 'inline-flex min-w-fit items-center gap-2 rounded-full border border-primary bg-primary/5 px-3 py-1.5 text-left text-sm' : 'inline-flex min-w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm hover:bg-muted/40'}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </span>
                    <Badge variant={completion[tab.key] ? 'default' : 'secondary'} className="h-5 rounded-full px-1.5 text-[10px]">
                      {completion[tab.key] ? 'OK' : '-'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            {activeTab === 'subjective' && (
              <SubjectivePane
                chiefComplaint={form.chief_complaint}
                historyOfPresentIllness={form.history_of_present_illness}
                clinicalAlert={form.clinical_alert}
                allergyNotes={form.allergy_notes}
                subjective={form.subjective}
                complaint={visit?.complaint || ''}
                patientAllergies={patient?.allergies || ''}
                onChange={(field, value) => handleFieldChange(field, value)}
                readOnly={readOnly}
              />
            )}
            {activeTab === 'objective' && (
              <ObjectivePane form={form} onChange={handleFieldChange} readOnly={readOnly} />
            )}
            {activeTab === 'assessment' && (
              <AssessmentPane
                assessment={form.assessment}
                diagnoses={record.diagnoses || []}
                icd10List={icd10List}
                onAssessmentChange={(value) => handleFieldChange('assessment', value)}
                onAddDiagnosis={handleAddDiagnosis}
                onDeleteDiagnosis={handleDeleteDiagnosis}
                readOnly={readOnly}
              />
            )}
            {activeTab === 'plan' && (
              <PlanPane
                plan={form.plan}
                followUpInstruction={form.follow_up_instruction}
                followUpAt={form.follow_up_at}
                notes={form.notes}
                prescriptions={record.prescriptions || []}
                actions={record.actions || []}
                medicineList={medicineList}
                serviceList={serviceList}
                onPlanChange={(value) => handleFieldChange('plan', value)}
                onFollowUpInstructionChange={(value) => handleFieldChange('follow_up_instruction', value)}
                onFollowUpAtChange={(value) => handleFieldChange('follow_up_at', value)}
                onNotesChange={(value) => handleFieldChange('notes', value)}
                onAddPrescription={handleAddPrescription}
                onDeletePrescription={handleDeletePrescription}
                onAddAction={handleAddAction}
                onDeleteAction={handleDeleteAction}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Ringkasan Klinis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <DenseStat label="No. RM" value={patient?.medical_record_number || '-'} />
              <DenseStat label="Usia / JK" value={`${age !== null ? `${age} th` : '-'} · ${patient?.gender === 'L' ? 'Laki-laki' : patient?.gender === 'P' ? 'Perempuan' : '-'}`} />
              <DenseStat label="Pembayaran" value={visit?.payment_type?.toUpperCase() || '-'} />
              <DenseStat label="Prioritas" value={visit?.priority === 'urgent' ? 'Urgent' : 'Normal'} alert={visit?.priority === 'urgent'} />
              <DenseStat label="BMI" value={bmi ? `${bmi} (${getBMIStatus(bmi)})` : 'Belum lengkap'} alert={bmi >= 30} />
              <DenseStat label="Nyeri" value={form.pain_scale ? `${form.pain_scale}/10` : 'Belum diisi'} alert={form.pain_scale >= 7} />
            </div>

            {(patient?.allergies || form.allergy_notes || form.clinical_alert) && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wide">Safety Notes</p>
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  {patient?.allergies && <p><span className="font-medium">Alergi master:</span> {patient.allergies}</p>}
                  {form.allergy_notes && <p><span className="font-medium">Alergi kunjungan:</span> {form.allergy_notes}</p>}
                  {form.clinical_alert && <p><span className="font-medium">Alert klinis:</span> {form.clinical_alert}</p>}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <div className="mb-2 flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Snapshot Vital</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>TD: {form.bp_systolic && form.bp_diastolic ? `${form.bp_systolic}/${form.bp_diastolic}` : '-'}</p>
                <p>Nadi: {form.heart_rate ? `${form.heart_rate} x/menit` : '-'}</p>
                <p>Suhu: {form.temperature ? `${form.temperature} °C` : '-'}</p>
                <p>SpO2: {form.spo2 ? `${form.spo2}%` : '-'}</p>
                <p>Nyeri: {form.pain_scale ? `${form.pain_scale}/10` : '-'}</p>
                <p>Kesadaran: {form.consciousness || '-'}</p>
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Progress</p>
              </div>
              <div className="grid gap-2">
                <DenseStat label="Bagian Selesai" value={`${completedCount}/4`} />
                <DenseStat label="Diagnosis" value={`${record.diagnoses?.length || 0}`} />
                <DenseStat label="Resep" value={`${record.prescriptions?.length || 0}`} />
                <DenseStat label="Tindakan" value={`${record.actions?.length || 0}`} />
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Visit Aktif</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Tanggal: {formatDate(visit?.visit_date)}</p>
                <p>Keluhan: {visit?.complaint || '-'}</p>
                <p>Keluhan utama RM: {form.chief_complaint || '-'}</p>
                <p>Kontrol: {form.follow_up_at ? formatDate(form.follow_up_at) : '-'}</p>
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Riwayat Singkat</p>
              </div>
              {historyRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada RM lain.</p>
              ) : (
                <div className="space-y-2">
                  {historyRecords.map((item) => (
                    <div key={item.id} className="rounded-lg border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{formatDate(item.record_date)}</p>
                        <Badge variant={item.status === 'final' ? 'default' : 'secondary'}>{item.status}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.assessment || item.subjective || 'Belum ada ringkasan.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
