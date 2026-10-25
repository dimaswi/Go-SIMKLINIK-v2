import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type {
  ICD10,
  MedicalActionMutationPayload,
  MedicalRecord,
  MedicalRecordSectionType,
  MedicalService,
  Medicine,
  OdontogramEntry,
  PhysicalExamImageMaster,
} from '@/lib/api';
import { CONSCIOUSNESS_OPTIONS, DISPOSITION_OPTIONS } from '../constants';
import type { MedicalRecordDraft } from '../types';
import { DiagnosisEditor } from './diagnosis-editor';
import { NumberInput, PAPER_INPUT_CLASSNAME, PAPER_SELECT_TRIGGER_CLASSNAME, TableCell, TableRow, TableSection, TextEditor } from './form-fields';
import { PainScalePicker } from './pain-scale-picker';
import { PhysicalExamImagePicker } from './physical-exam-image-picker';
import { PrescriptionEditor } from './prescription-editor';
import { ProcedureEditor } from './procedure-editor';
import { LaboratoryOrderEditor } from './laboratory-order-editor';
import { RadiologyOrderEditor } from './radiology-order-editor';

type SectionEditorBodyProps = {
  section: MedicalRecordSectionType;
  variant?: 'default' | 'dental' | 'surat';
  draft: MedicalRecordDraft;
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>;
  record: MedicalRecord | null;
  icd10List: ICD10[];
  medicineList: Medicine[];
  serviceList: MedicalService[];
  physicalExamImageList: PhysicalExamImageMaster[];
  onAddDiagnosis: (payload: { icd10_id: number; diagnosis_type: 'primer' | 'sekunder'; working_diagnosis: string; differential_diagnosis: string; assessment_narrative: string; notes: string }) => void;
  onDeleteDiagnosis: (diagnosisId: number) => void;
  onAddPrescription: (payload: { medicine_id: number; quantity: number; dosage: string; frequency: string; duration: string; route: string; instructions: string; notes: string }) => void;
  onDeletePrescription: (prescriptionId: number) => void;
  onAddPrescriptionCompound?: (payload: {
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
  }) => void;
  onDeletePrescriptionCompound?: (compoundId: number) => void;
  onSubmitPrescriptionOrder?: () => void;
  onCancelPrescriptionOrder?: () => void;
  onPrintPrescriptionOrder?: () => void;
  onPrintPrescriptionTicket?: () => void;
  canCancelPrescriptionOrder?: boolean;
  prescriptionActionState?: {
    submitting: boolean;
    canceling?: boolean;
    printingPrescription: boolean;
    printingTicket: boolean;
  };
  onAddLaboratoryOrderItem?: (payload: { medical_service_id: number; instructions: string }) => void;
  onDeleteLaboratoryOrderItem?: (itemId: number) => void;
  onCancelLaboratoryOrder?: () => void;
  onPrintLaboratoryTicket?: () => void;
  onPrintLaboratoryResult?: () => void;
  canCancelLaboratoryOrder?: boolean;
  laboratoryActionState?: {
    canceling?: boolean;
    printingTicket: boolean;
    printingResult: boolean;
  };
  onAddRadiologyOrderItem?: (payload: { medical_service_id: number; instructions: string }) => void;
  onDeleteRadiologyOrderItem?: (itemId: number) => void;
  onCancelRadiologyOrder?: () => void;
  onPrintRadiologyTicket?: () => void;
  onPrintRadiologyResult?: () => void;
  canCancelRadiologyOrder?: boolean;
  radiologyActionState?: {
    canceling?: boolean;
    printingTicket: boolean;
    printingResult: boolean;
  };
  onPrintProcedure?: () => void;
  procedureActionState?: {
    printing: boolean;
  };
  odontogramEntries?: OdontogramEntry[];
  onAddAction: (payload: MedicalActionMutationPayload) => Promise<boolean | void> | boolean | void;
  onUpdateAction?: (actionId: number, payload: MedicalActionMutationPayload) => Promise<boolean | void> | boolean | void;
  onDeleteAction: (actionId: number) => Promise<boolean | void> | boolean | void;
  readOnly: boolean;
};

const SURAT_STATUS_OPTIONS = [
  { value: 'surat_diterbitkan', label: 'Surat Diterbitkan' },
  { value: 'surat_ditunda', label: 'Surat Ditunda' },
  { value: 'surat_tidak_diterbitkan', label: 'Surat Tidak Diterbitkan' },
];

type SuratTypeValue = 'surat-sakit' | 'surat-sehat' | 'surat-mcu' | 'surat-buta-warna' | 'surat-keterangan';

type SuratFieldProfile = {
  assessmentPlaceholder: string;
  purposePlaceholder: string;
  summaryPlaceholder: string;
  validityPlaceholder: string;
};

const SURAT_FIELD_PROFILES: Record<SuratTypeValue, SuratFieldProfile> = {
  'surat-sakit': {
    assessmentPlaceholder: 'Tuliskan pertimbangan klinis perlunya istirahat (contoh: kondisi pasien memerlukan masa pemulihan klinis).',
    purposePlaceholder: 'Contoh: Izin tidak masuk kerja / sekolah / instansi.',
    summaryPlaceholder: 'Contoh: Diberikan rekomendasi istirahat selama ... hari.',
    validityPlaceholder: 'Contoh: Istirahat 3 hari di rumah, kontrol kembali bila belum membaik.',
  },
  'surat-sehat': {
    assessmentPlaceholder: 'Tuliskan hasil pemeriksaan umum (contoh: pemeriksaan fisik dan tanda vital dalam batas normal).',
    purposePlaceholder: 'Contoh: Persyaratan melamar pekerjaan, administrasi pendidikan, atau instansi.',
    summaryPlaceholder: 'Contoh: Dinyatakan dalam kondisi SEHAT.',
    validityPlaceholder: 'Contoh: Berlaku 7 hari sejak tanggal pemeriksaan.',
  },
  'surat-mcu': {
    assessmentPlaceholder: 'Tuliskan ringkasan pemeriksaan kesehatan MCU secara umum.',
    purposePlaceholder: 'Contoh: Paket MCU pra-kerja, berkala, atau persyaratan instansi.',
    summaryPlaceholder: 'Contoh: Dinyatakan SEHAT / MEMENUHI SYARAT KESEHATAN.',
    validityPlaceholder: 'Contoh: Hasil berlaku 6 bulan sesuai ketentuan.',
  },
  'surat-buta-warna': {
    assessmentPlaceholder: 'Tuliskan metode skrining penglihatan warna (contoh: Pemeriksaan tes Ishihara).',
    purposePlaceholder: 'Contoh: Persyaratan sekolah, perguruan tinggi, atau institusi kerja.',
    summaryPlaceholder: 'Contoh: Dinyatakan TIDAK BUTA WARNA.',
    validityPlaceholder: 'Contoh: Berlaku untuk keperluan administrasi institusi terkait.',
  },
  'surat-keterangan': {
    assessmentPlaceholder: 'Tuliskan dasar pertimbangan klinis dokter untuk penerbitan surat.',
    purposePlaceholder: 'Contoh: Keperluan administrasi kerja, sekolah, atau instansi.',
    summaryPlaceholder: 'Tuliskan isi kesimpulan atau pernyataan medis dokter.',
    validityPlaceholder: 'Contoh: Berlaku sesuai kebutuhan administratif.',
  },
};

function inferSuratTypeFromEntryGroupKey(entryGroupKey?: string) {
  const normalized = (entryGroupKey || '').trim().toLowerCase();
  if (!normalized) return 'surat-keterangan' as SuratTypeValue;
  if (normalized === 'surat-sakit' || normalized.startsWith('surat-sakit-')) return 'surat-sakit' as SuratTypeValue;
  if (normalized === 'surat-sehat' || normalized.startsWith('surat-sehat-')) return 'surat-sehat' as SuratTypeValue;
  if (normalized === 'surat-mcu' || normalized.startsWith('surat-mcu-')) return 'surat-mcu' as SuratTypeValue;
  if (normalized === 'surat-buta-warna' || normalized.startsWith('surat-buta-warna-')) return 'surat-buta-warna' as SuratTypeValue;
  return 'surat-keterangan' as SuratTypeValue;
}

function getSuratFieldProfile(record: MedicalRecord | null) {
  const suratType = inferSuratTypeFromEntryGroupKey(record?.entry_group_key);
  return SURAT_FIELD_PROFILES[suratType];
}

type VitalIndicator = {
  tone: 'normal' | 'warning' | 'danger';
  label: string;
};

function getVitalIndicator(
  field: 'bp_systolic' | 'bp_diastolic' | 'heart_rate' | 'temperature' | 'respiratory_rate' | 'spo2',
  value: number
): VitalIndicator | null {
  if (!value) return null;

  switch (field) {
    case 'bp_systolic':
      if (value < 90) return { tone: 'danger', label: 'Hipotensi' };
      if (value < 100) return { tone: 'warning', label: 'Rendah' };
      if (value <= 139) return { tone: 'normal', label: 'Normal' };
      if (value <= 159) return { tone: 'warning', label: 'Tinggi' };
      return { tone: 'danger', label: 'Sangat tinggi' };
    case 'bp_diastolic':
      if (value < 50) return { tone: 'danger', label: 'Sangat rendah' };
      if (value < 60) return { tone: 'warning', label: 'Rendah' };
      if (value <= 89) return { tone: 'normal', label: 'Normal' };
      if (value <= 99) return { tone: 'warning', label: 'Tinggi' };
      return { tone: 'danger', label: 'Sangat tinggi' };
    case 'heart_rate':
      if (value < 50) return { tone: 'danger', label: 'Bradikardi' };
      if (value < 60) return { tone: 'warning', label: 'Lambat' };
      if (value <= 100) return { tone: 'normal', label: 'Normal' };
      if (value <= 119) return { tone: 'warning', label: 'Cepat' };
      return { tone: 'danger', label: 'Takikardi' };
    case 'temperature':
      if (value < 35.5) return { tone: 'danger', label: 'Hipotermia' };
      if (value < 36) return { tone: 'warning', label: 'Di bawah normal' };
      if (value <= 37.5) return { tone: 'normal', label: 'Normal' };
      if (value <= 38.4) return { tone: 'warning', label: 'Demam' };
      return { tone: 'danger', label: 'Demam tinggi' };
    case 'respiratory_rate':
      if (value < 10) return { tone: 'danger', label: 'Bradipnea' };
      if (value < 12) return { tone: 'warning', label: 'Rendah' };
      if (value <= 20) return { tone: 'normal', label: 'Normal' };
      if (value <= 24) return { tone: 'warning', label: 'Cepat' };
      return { tone: 'danger', label: 'Takipnea' };
    case 'spo2':
      if (value < 92) return { tone: 'danger', label: 'Desaturasi' };
      if (value <= 94) return { tone: 'warning', label: 'Borderline' };
      if (value <= 100) return { tone: 'normal', label: 'Normal' };
      return { tone: 'warning', label: 'Cek ulang' };
    default:
      return null;
  }
}

function parseISODate(value?: string) {
  const normalized = (value || '').trim();
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIndonesianDate(value?: string) {
  const date = parseISODate(value);
  if (!date) return '-';

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function buildSuratValidityDescription(startDate: string, endDate: string) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);

  if (!start || !end) return '';
  if (end < start) {
    return 'Rentang tanggal tidak valid. Tanggal sampai harus sama atau setelah tanggal mulai.';
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diffInDays = Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
  return `Masa berlaku ${diffInDays} hari, mulai ${formatIndonesianDate(startDate)} sampai ${formatIndonesianDate(endDate)}.`;
}

function renderDentalAnamnesis(
  draft: MedicalRecordDraft,
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>,
  readOnly: boolean
) {
  return (
    <div className="space-y-0">
      <TableSection
        title="Keluhan Dental & Riwayat"
      >
        <TableRow>
          <TableCell label="Keluhan Utama Gigi / Mulut" colSpan={2}>
            <TextEditor
              label="Keluhan Utama Gigi / Mulut"
              hideLabel
              value={draft.chief_complaint}
              onChange={(value) => setDraft((prev) => ({ ...prev, chief_complaint: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: nyeri gigi kiri bawah saat mengunyah, gusi bengkak, atau perdarahan saat sikat gigi."
            />
          </TableCell>
          <TableCell label="Gigi / Regio Target">
            <TextEditor
              label="Gigi / Regio Target"
              hideLabel
              value={draft.subjective}
              onChange={(value) => setDraft((prev) => ({ ...prev, subjective: value }))}
              disabled={readOnly}
              rows={2}
              placeholder="Contoh: 36, regio posterior kanan atas, atau rahang bawah kiri."
            />
          </TableCell>
          <TableCell label="Alert Dental / Red Flag">
            <TextEditor
              label="Alert Dental / Red Flag"
              hideLabel
              value={draft.clinical_alert}
              onChange={(value) => setDraft((prev) => ({ ...prev, clinical_alert: value }))}
              disabled={readOnly}
              rows={2}
              placeholder="Contoh: trismus, bengkak difus, demam, perdarahan aktif, atau kecurigaan abses."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Riwayat Keluhan Gigi Saat Ini" colSpan={4}>
            <TextEditor
              label="Riwayat Keluhan Gigi Saat Ini"
              hideLabel
              value={draft.history_of_present_illness}
              onChange={(value) => setDraft((prev) => ({ ...prev, history_of_present_illness: value }))}
              disabled={readOnly}
              rows={4}
              placeholder="Tuliskan onset, durasi, pencetus, pereda, karakter nyeri, riwayat bengkak, trauma, atau keluhan kunyah."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Riwayat Penyakit Sistemik Relevan">
            <TextEditor
              label="Riwayat Penyakit Sistemik Relevan"
              hideLabel
              value={draft.past_medical_history}
              onChange={(value) => setDraft((prev) => ({ ...prev, past_medical_history: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: diabetes, hipertensi, penyakit jantung, gangguan perdarahan, atau kehamilan."
            />
          </TableCell>
          <TableCell label="Riwayat Perawatan / Tindakan Gigi Sebelumnya">
            <TextEditor
              label="Riwayat Perawatan / Tindakan Gigi Sebelumnya"
              hideLabel
              value={draft.past_surgical_history}
              onChange={(value) => setDraft((prev) => ({ ...prev, past_surgical_history: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: tambalan, pencabutan, scaling, RCT, pemasangan gigi tiruan, atau ortho."
            />
          </TableCell>
          <TableCell label="Obat Rutin / Antikoagulan">
            <TextEditor
              label="Obat Rutin / Antikoagulan"
              hideLabel
              value={draft.medication_history}
              onChange={(value) => setDraft((prev) => ({ ...prev, medication_history: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: aspirin, clopidogrel, insulin, steroid, atau antibiotik yang sedang digunakan."
            />
          </TableCell>
          <TableCell label="Alergi Obat / Anestesi / Bahan Dental">
            <TextEditor
              label="Alergi Obat / Anestesi / Bahan Dental"
              hideLabel
              value={draft.allergy_notes}
              onChange={(value) => setDraft((prev) => ({ ...prev, allergy_notes: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: alergi lidokain, penisilin, lateks, atau bahan akrilik."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Kebiasaan Oral & Faktor Risiko" colSpan={2}>
            <TextEditor
              label="Kebiasaan Oral & Faktor Risiko"
              hideLabel
              value={draft.social_history}
              onChange={(value) => setDraft((prev) => ({ ...prev, social_history: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: merokok, bruxism, menggigit benda keras, mouth breathing, atau konsumsi gula tinggi."
            />
          </TableCell>
          <TableCell label="Kebersihan Mulut / Perawatan Harian">
            <TextEditor
              label="Kebersihan Mulut / Perawatan Harian"
              hideLabel
              value={draft.review_of_systems}
              onChange={(value) => setDraft((prev) => ({ ...prev, review_of_systems: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: frekuensi sikat gigi, flossing, mouthwash, dan kunjungan kontrol rutin."
            />
          </TableCell>
          <TableCell label="Riwayat Keluarga Relevan">
            <TextEditor
              label="Riwayat Keluarga Relevan"
              hideLabel
              value={draft.family_history}
              onChange={(value) => setDraft((prev) => ({ ...prev, family_history: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: riwayat kelainan rahang, penyakit periodontal berat, atau faktor genetik lain yang relevan."
            />
          </TableCell>
        </TableRow>
      </TableSection>
    </div>
  );
}

function renderDentalPhysicalExam(
  draft: MedicalRecordDraft,
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>,
  physicalExamImageList: PhysicalExamImageMaster[],
  readOnly: boolean
) {
  return (
    <div className="space-y-3">
      <TableSection
        title="Kondisi Umum & Tanda Vital"
      >
        <TableRow>
          <TableCell label="TD Sistolik">
            <NumberInput label="TD Sistolik" hideLabel value={draft.bp_systolic} onChange={(value) => setDraft((prev) => ({ ...prev, bp_systolic: value }))} disabled={readOnly} indicator={getVitalIndicator('bp_systolic', draft.bp_systolic)} />
          </TableCell>
          <TableCell label="TD Diastolik">
            <NumberInput label="TD Diastolik" hideLabel value={draft.bp_diastolic} onChange={(value) => setDraft((prev) => ({ ...prev, bp_diastolic: value }))} disabled={readOnly} indicator={getVitalIndicator('bp_diastolic', draft.bp_diastolic)} />
          </TableCell>
          <TableCell label="Nadi">
            <NumberInput label="Nadi" hideLabel value={draft.heart_rate} onChange={(value) => setDraft((prev) => ({ ...prev, heart_rate: value }))} disabled={readOnly} indicator={getVitalIndicator('heart_rate', draft.heart_rate)} />
          </TableCell>
          <TableCell label="Suhu">
            <NumberInput label="Suhu" hideLabel value={draft.temperature} onChange={(value) => setDraft((prev) => ({ ...prev, temperature: value }))} disabled={readOnly} step={0.1} indicator={getVitalIndicator('temperature', draft.temperature)} />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Respirasi">
            <NumberInput label="Respirasi" hideLabel value={draft.respiratory_rate} onChange={(value) => setDraft((prev) => ({ ...prev, respiratory_rate: value }))} disabled={readOnly} indicator={getVitalIndicator('respiratory_rate', draft.respiratory_rate)} />
          </TableCell>
          <TableCell label="SpO2">
            <NumberInput label="SpO2" hideLabel value={draft.spo2} onChange={(value) => setDraft((prev) => ({ ...prev, spo2: value }))} disabled={readOnly} step={0.1} indicator={getVitalIndicator('spo2', draft.spo2)} />
          </TableCell>
          <TableCell label="Kesadaran">
            <SearchableSelect options={CONSCIOUSNESS_OPTIONS} value={draft.consciousness} onValueChange={(value) => setDraft((prev) => ({ ...prev, consciousness: value }))} placeholder="Pilih kesadaran" disabled={readOnly} square className={PAPER_SELECT_TRIGGER_CLASSNAME} />
          </TableCell>
          <TableCell label="Tinggi / Berat Badan">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Tinggi Badan (cm)" hideLabel value={draft.height} onChange={(value) => setDraft((prev) => ({ ...prev, height: value }))} disabled={readOnly} step={0.1} />
              <NumberInput label="Berat Badan (kg)" hideLabel value={draft.weight} onChange={(value) => setDraft((prev) => ({ ...prev, weight: value }))} disabled={readOnly} step={0.1} />
            </div>
          </TableCell>
        </TableRow>
      </TableSection>

      <TableSection
        title="Pemeriksaan Gigi dan Mulut"
      >
        <TableRow>
          <TableCell label="Pemeriksaan Ekstraoral / TMJ" colSpan={2}>
            <TextEditor
              label="Pemeriksaan Ekstraoral / TMJ"
              hideLabel
              value={draft.physical_examination}
              onChange={(value) => setDraft((prev) => ({ ...prev, physical_examination: value }))}
              disabled={readOnly}
              rows={5}
              placeholder="Contoh: asimetri wajah, pembesaran kelenjar, nyeri TMJ, trismus, bengkak, palpasi ekstraoral."
            />
          </TableCell>
          <TableCell label="Pemeriksaan Intraoral / Periodontal / Oklusi" colSpan={2}>
            <TextEditor
              label="Pemeriksaan Intraoral / Periodontal / Oklusi"
              hideLabel
              value={draft.supporting_examination}
              onChange={(value) => setDraft((prev) => ({ ...prev, supporting_examination: value }))}
              disabled={readOnly}
              rows={5}
              placeholder="Contoh: mukosa, gingiva, karies, mobilitas, perkusi, palpasi, oklusi, oral hygiene, atau hasil radiograf singkat."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Diagram / Foto Oral" colSpan={4}>
            <PhysicalExamImagePicker
              masters={physicalExamImageList}
              value={draft.physical_exam_images}
              onChange={(value) => setDraft((prev) => ({ ...prev, physical_exam_images: value }))}
              readOnly={readOnly}
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Nyeri Odontologi" colSpan={4}>
            <PainScalePicker
              scaleType={draft.pain_scale_type}
              value={draft.pain_scale}
              onScaleTypeChange={(value) => setDraft((prev) => ({ ...prev, pain_scale_type: value, pain_scale: 0 }))}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, pain_scale: value }))}
              disabled={readOnly}
            />
          </TableCell>
        </TableRow>
      </TableSection>
    </div>
  );
}

function renderDentalAssessment(
  draft: MedicalRecordDraft,
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>,
  record: MedicalRecord | null,
  icd10List: ICD10[],
  onAddDiagnosis: (payload: { icd10_id: number; diagnosis_type: 'primer' | 'sekunder'; working_diagnosis: string; differential_diagnosis: string; assessment_narrative: string; notes: string }) => void,
  onDeleteDiagnosis: (diagnosisId: number) => void,
  readOnly: boolean
) {
  return (
    <div className="space-y-3">
      <TableSection
        title="Ringkasan Assessment Dental"
      >
        <TableRow>
          <TableCell label="Diagnosis Kerja" colSpan={2}>
            <TextEditor
              label="Diagnosis Kerja"
              hideLabel
              value={draft.working_diagnosis}
              onChange={(value) => setDraft((prev) => ({ ...prev, working_diagnosis: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Contoh: pulpitis irreversibel 36, abses periapikal regio 11, atau gingivitis kronis."
            />
          </TableCell>
          <TableCell label="Diagnosis Banding" colSpan={2}>
            <TextEditor
              label="Diagnosis Banding"
              hideLabel
              value={draft.differential_diagnosis}
              onChange={(value) => setDraft((prev) => ({ ...prev, differential_diagnosis: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Tuliskan diagnosis banding bila ada."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Narasi Assessment / Pertimbangan Klinis" colSpan={4}>
            <TextEditor
              label="Narasi Assessment / Pertimbangan Klinis"
              hideLabel
              value={draft.assessment}
              onChange={(value) => setDraft((prev) => ({ ...prev, assessment: value }))}
              disabled={readOnly}
              rows={4}
              placeholder="Jelaskan kaitan temuan klinis, gigi yang terlibat, tingkat kegawatan, dan dasar rencana tata laksana awal."
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Rencana Perawatan Gigi" colSpan={2}>
            <TextEditor
              label="Rencana Perawatan Gigi"
              hideLabel
              value={draft.plan}
              onChange={(value) => setDraft((prev) => ({ ...prev, plan: value }))}
              disabled={readOnly}
              rows={4}
              placeholder="Contoh: medikasi awal, observasi, tambalan sementara, scaling, ekstraksi, endodontik, atau rencana bertahap lainnya."
            />
          </TableCell>
          <TableCell label="Instruksi Kontrol / Recall" colSpan={2}>
            <div className="space-y-3">
              <TextEditor
                label="Instruksi Kontrol / Recall"
                hideLabel
                value={draft.follow_up_instruction}
                onChange={(value) => setDraft((prev) => ({ ...prev, follow_up_instruction: value }))}
                disabled={readOnly}
                rows={3}
                placeholder="Contoh: kontrol 3 hari bila nyeri belum reda, kembali setelah hasil radiograf, atau evaluasi pasca pencabutan."
              />
              <div className="space-y-1">
                <Input
                  type="datetime-local"
                  value={draft.follow_up_at}
                  onChange={(event) => setDraft((prev) => ({ ...prev, follow_up_at: event.target.value }))}
                  disabled={readOnly}
                  className={PAPER_INPUT_CLASSNAME}
                />
                <p className="text-xs text-muted-foreground">Jadwal recall atau kunjungan kontrol berikutnya, bila sudah direncanakan.</p>
              </div>
            </div>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Catatan Rencana / Edukasi" colSpan={4}>
            <TextEditor
              label="Catatan Rencana / Edukasi"
              hideLabel
              value={draft.notes}
              onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))}
              disabled={readOnly}
              rows={3}
              placeholder="Tambahkan edukasi pasien, informed refusal, risiko yang dijelaskan, atau catatan tindak lanjut lain yang perlu diingat."
            />
          </TableCell>
        </TableRow>
      </TableSection>

      <DiagnosisEditor diagnoses={record?.diagnoses || []} icd10List={icd10List} onAdd={onAddDiagnosis} onDelete={onDeleteDiagnosis} readOnly={readOnly} />
    </div>
  );
}

function renderSuratAssessment(
  draft: MedicalRecordDraft,
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>,
  record: MedicalRecord | null,
  readOnly: boolean
) {
  const profile = getSuratFieldProfile(record);

  return (
    <div className="space-y-0">
      <TableSection>
        <TableRow>
          <TableCell label="Dasar Pertimbangan Klinis" colSpan={4}>
            <TextEditor
              label="Dasar Pertimbangan Klinis"
              hideLabel
              value={draft.assessment}
              onChange={(value) => setDraft((prev) => ({ ...prev, assessment: value }))}
              disabled={readOnly}
              rows={3}
              placeholder={profile.assessmentPlaceholder}
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Peruntukan / Keperluan Surat" colSpan={2}>
            <TextEditor
              label="Peruntukan / Keperluan Surat"
              hideLabel
              value={draft.plan}
              onChange={(value) => setDraft((prev) => ({ ...prev, plan: value }))}
              disabled={readOnly}
              rows={2}
              placeholder={profile.purposePlaceholder}
            />
          </TableCell>
          <TableCell label="Catatan Tambahan (Opsional)" colSpan={2}>
            <TextEditor
              label="Catatan Tambahan (Opsional)"
              hideLabel
              value={draft.notes}
              onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))}
              disabled={readOnly}
              rows={2}
              placeholder="Catatan tambahan bila diperlukan."
            />
          </TableCell>
        </TableRow>
      </TableSection>
    </div>
  );
}

function renderSuratOutcome(
  draft: MedicalRecordDraft,
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>,
  record: MedicalRecord | null,
  readOnly: boolean
) {
  const profile = getSuratFieldProfile(record);
  const suratType = inferSuratTypeFromEntryGroupKey(record?.entry_group_key);
  const isSuratSakit = suratType === 'surat-sakit';

  const validityStartDate = (draft.referral_destination || '').slice(0, 10);
  const validityEndDate = (draft.referral_reason || '').slice(0, 10);

  const updateValidityPeriod = (nextStartDate: string, nextEndDate: string) => {
    let nextDescription = draft.follow_up_instruction;
    if (isSuratSakit) {
      if (nextStartDate && nextEndDate) {
        const start = new Date(nextStartDate);
        const end = new Date(nextEndDate);
        const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (!isNaN(diffDays) && diffDays > 0) {
          nextDescription = `Istirahat ${diffDays} hari (${nextStartDate} s/d ${nextEndDate})`;
        }
      } else if (nextStartDate) {
        nextDescription = `Mulai ${nextStartDate}`;
      }
    } else {
      nextDescription = buildSuratValidityDescription(nextStartDate, nextEndDate);
    }

    setDraft((prev) => ({
      ...prev,
      referral_destination: nextStartDate,
      referral_reason: nextEndDate,
      follow_up_instruction: nextDescription || prev.follow_up_instruction,
      follow_up_at: nextStartDate ? `${nextStartDate}T00:00` : '',
    }));
  };

  const validityFieldLabel = isSuratSakit ? 'Durasi / Instruksi Istirahat' : 'Masa Berlaku Surat';

  return (
    <div className="space-y-0">
      <TableSection>
        <TableRow>
          <TableCell label="Status Surat" colSpan={1}>
            <SearchableSelect
              options={SURAT_STATUS_OPTIONS}
              value={draft.disposition}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, disposition: value }))}
              placeholder="Pilih status surat"
              disabled={readOnly}
              square
              className={PAPER_SELECT_TRIGGER_CLASSNAME}
            />
          </TableCell>
          <TableCell label="Pernyataan / Keputusan Dokter" colSpan={3}>
            <TextEditor
              label="Pernyataan / Keputusan Dokter"
              hideLabel
              value={draft.discharge_condition}
              onChange={(value) => setDraft((prev) => ({ ...prev, discharge_condition: value }))}
              disabled={readOnly}
              rows={2}
              placeholder={profile.summaryPlaceholder}
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label={isSuratSakit ? 'Tanggal Mulai Istirahat' : 'Tanggal Mulai Berlaku'} colSpan={2}>
            <Input
              type="date"
              value={validityStartDate}
              onChange={(event) => updateValidityPeriod(event.target.value, validityEndDate)}
              disabled={readOnly}
              className={PAPER_INPUT_CLASSNAME}
            />
          </TableCell>
          <TableCell label={isSuratSakit ? 'Tanggal Selesai Istirahat' : 'Tanggal Selesai Berlaku'} colSpan={2}>
            <Input
              type="date"
              value={validityEndDate}
              onChange={(event) => updateValidityPeriod(validityStartDate, event.target.value)}
              disabled={readOnly}
              className={PAPER_INPUT_CLASSNAME}
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label={validityFieldLabel} colSpan={4}>
            <TextEditor
              label={validityFieldLabel}
              hideLabel
              value={draft.follow_up_instruction}
              onChange={(value) => setDraft((prev) => ({ ...prev, follow_up_instruction: value }))}
              disabled={readOnly}
              rows={2}
              placeholder={profile.validityPlaceholder}
            />
          </TableCell>
        </TableRow>
      </TableSection>
    </div>
  );
}

export function SectionEditorBody({
  section,
  variant = 'default',
  draft,
  setDraft,
  record,
  icd10List,
  medicineList,
  serviceList,
  physicalExamImageList,
  onAddDiagnosis,
  onDeleteDiagnosis,
  onAddPrescription,
  onDeletePrescription,
  onAddPrescriptionCompound,
  onDeletePrescriptionCompound,
  onSubmitPrescriptionOrder,
  onCancelPrescriptionOrder,
  onPrintPrescriptionOrder,
  onPrintPrescriptionTicket,
  canCancelPrescriptionOrder,
  prescriptionActionState,
  onAddLaboratoryOrderItem = () => undefined,
  onDeleteLaboratoryOrderItem = () => undefined,
  onCancelLaboratoryOrder,
  onPrintLaboratoryTicket,
  onPrintLaboratoryResult,
  canCancelLaboratoryOrder,
  laboratoryActionState,
  onAddRadiologyOrderItem = () => undefined,
  onDeleteRadiologyOrderItem = () => undefined,
  onCancelRadiologyOrder,
  onPrintRadiologyTicket,
  onPrintRadiologyResult,
  canCancelRadiologyOrder,
  radiologyActionState,
  onPrintProcedure,
  procedureActionState,
  odontogramEntries = [],
  onAddAction,
  onUpdateAction,
  onDeleteAction,
  readOnly,
}: SectionEditorBodyProps) {
  switch (section) {
    case 'anamnesis':
      if (variant === 'dental') {
        return renderDentalAnamnesis(draft, setDraft, readOnly);
      }

      return (
        <div className="space-y-0">
          <TableSection title="Keluhan dan Riwayat">
            <TableRow>
              <TableCell label="Keluhan Utama" colSpan={2}>
                <TextEditor label="Keluhan Utama" hideLabel value={draft.chief_complaint} onChange={(value) => setDraft((prev) => ({ ...prev, chief_complaint: value }))} disabled={readOnly} rows={3} />
              </TableCell>
              <TableCell label="Alert Klinis">
                <TextEditor label="Alert Klinis" hideLabel value={draft.clinical_alert} onChange={(value) => setDraft((prev) => ({ ...prev, clinical_alert: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Alergi / Reaksi Obat">
                <TextEditor label="Alergi / Reaksi Obat" hideLabel value={draft.allergy_notes} onChange={(value) => setDraft((prev) => ({ ...prev, allergy_notes: value }))} disabled={readOnly} rows={2} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Riwayat Penyakit Sekarang" colSpan={4}>
                <TextEditor label="Riwayat Penyakit Sekarang" hideLabel value={draft.history_of_present_illness} onChange={(value) => setDraft((prev) => ({ ...prev, history_of_present_illness: value }))} disabled={readOnly} rows={4} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Riwayat Penyakit Dahulu">
                <TextEditor label="Riwayat Penyakit Dahulu" hideLabel value={draft.past_medical_history} onChange={(value) => setDraft((prev) => ({ ...prev, past_medical_history: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Riwayat Operasi / Tindakan">
                <TextEditor label="Riwayat Operasi / Tindakan" hideLabel value={draft.past_surgical_history} onChange={(value) => setDraft((prev) => ({ ...prev, past_surgical_history: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Riwayat Obat / Terapi">
                <TextEditor label="Riwayat Obat / Terapi" hideLabel value={draft.medication_history} onChange={(value) => setDraft((prev) => ({ ...prev, medication_history: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Riwayat Keluarga">
                <TextEditor label="Riwayat Keluarga" hideLabel value={draft.family_history} onChange={(value) => setDraft((prev) => ({ ...prev, family_history: value }))} disabled={readOnly} rows={2} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Riwayat Sosial / Kebiasaan">
                <TextEditor label="Riwayat Sosial / Kebiasaan" hideLabel value={draft.social_history} onChange={(value) => setDraft((prev) => ({ ...prev, social_history: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Review of Systems">
                <TextEditor label="Review of Systems" hideLabel value={draft.review_of_systems} onChange={(value) => setDraft((prev) => ({ ...prev, review_of_systems: value }))} disabled={readOnly} rows={2} />
              </TableCell>
              <TableCell label="Catatan Subjektif Tambahan" colSpan={2}>
                <TextEditor label="Catatan Subjektif Tambahan" hideLabel value={draft.subjective} onChange={(value) => setDraft((prev) => ({ ...prev, subjective: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
          </TableSection>
        </div>
      );
    case 'physical_exam':
      if (variant === 'dental') {
        return renderDentalPhysicalExam(draft, setDraft, physicalExamImageList, readOnly);
      }

      return (
        <div className="space-y-0">
          <TableSection title="Tanda Vital dan Objektif">
            <TableRow>
              <TableCell label="TD Sistolik">
                <NumberInput label="TD Sistolik" hideLabel value={draft.bp_systolic} onChange={(value) => setDraft((prev) => ({ ...prev, bp_systolic: value }))} disabled={readOnly} indicator={getVitalIndicator('bp_systolic', draft.bp_systolic)} />
              </TableCell>
              <TableCell label="TD Diastolik">
                <NumberInput label="TD Diastolik" hideLabel value={draft.bp_diastolic} onChange={(value) => setDraft((prev) => ({ ...prev, bp_diastolic: value }))} disabled={readOnly} indicator={getVitalIndicator('bp_diastolic', draft.bp_diastolic)} />
              </TableCell>
              <TableCell label="Nadi">
                <NumberInput label="Nadi" hideLabel value={draft.heart_rate} onChange={(value) => setDraft((prev) => ({ ...prev, heart_rate: value }))} disabled={readOnly} indicator={getVitalIndicator('heart_rate', draft.heart_rate)} />
              </TableCell>
              <TableCell label="Suhu">
                <NumberInput label="Suhu" hideLabel value={draft.temperature} onChange={(value) => setDraft((prev) => ({ ...prev, temperature: value }))} disabled={readOnly} step={0.1} indicator={getVitalIndicator('temperature', draft.temperature)} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Respirasi">
                <NumberInput label="Respirasi" hideLabel value={draft.respiratory_rate} onChange={(value) => setDraft((prev) => ({ ...prev, respiratory_rate: value }))} disabled={readOnly} indicator={getVitalIndicator('respiratory_rate', draft.respiratory_rate)} />
              </TableCell>
              <TableCell label="SpO2">
                <NumberInput label="SpO2" hideLabel value={draft.spo2} onChange={(value) => setDraft((prev) => ({ ...prev, spo2: value }))} disabled={readOnly} step={0.1} indicator={getVitalIndicator('spo2', draft.spo2)} />
              </TableCell>
              <TableCell label="Kesadaran">
                <SearchableSelect options={CONSCIOUSNESS_OPTIONS} value={draft.consciousness} onValueChange={(value) => setDraft((prev) => ({ ...prev, consciousness: value }))} placeholder="Pilih kesadaran" disabled={readOnly} square className={PAPER_SELECT_TRIGGER_CLASSNAME} />
              </TableCell>
              <TableCell label="Tinggi Badan (cm)">
                <NumberInput label="Tinggi Badan (cm)" hideLabel value={draft.height} onChange={(value) => setDraft((prev) => ({ ...prev, height: value }))} disabled={readOnly} step={0.1} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Berat Badan (kg)">
                <NumberInput label="Berat Badan (kg)" hideLabel value={draft.weight} onChange={(value) => setDraft((prev) => ({ ...prev, weight: value }))} disabled={readOnly} step={0.1} />
              </TableCell>
              <TableCell label="Pemeriksaan Fisik" colSpan={3}>
                <TextEditor label="Pemeriksaan Fisik" hideLabel value={draft.physical_examination} onChange={(value) => setDraft((prev) => ({ ...prev, physical_examination: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Pemeriksaan Penunjang" colSpan={4}>
                <TextEditor label="Pemeriksaan Penunjang" hideLabel value={draft.supporting_examination} onChange={(value) => setDraft((prev) => ({ ...prev, supporting_examination: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Gambar Pemeriksaan Fisik" colSpan={4}>
                <PhysicalExamImagePicker
                  masters={physicalExamImageList}
                  value={draft.physical_exam_images}
                  onChange={(value) => setDraft((prev) => ({ ...prev, physical_exam_images: value }))}
                  readOnly={readOnly}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Penilaian Nyeri" colSpan={4}>
                <PainScalePicker
                  scaleType={draft.pain_scale_type}
                  value={draft.pain_scale}
                  onScaleTypeChange={(value) => setDraft((prev) => ({ ...prev, pain_scale_type: value, pain_scale: 0 }))}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, pain_scale: value }))}
                  disabled={readOnly}
                />
              </TableCell>
            </TableRow>
          </TableSection>
        </div>
      );
    case 'assessment':
      if (variant === 'dental') {
        return renderDentalAssessment(draft, setDraft, record, icd10List, onAddDiagnosis, onDeleteDiagnosis, readOnly);
      }

      if (variant === 'surat') {
        return renderSuratAssessment(draft, setDraft, record, readOnly);
      }

      return (
        <div className="space-y-0">
          <DiagnosisEditor diagnoses={record?.diagnoses || []} icd10List={icd10List} onAdd={onAddDiagnosis} onDelete={onDeleteDiagnosis} readOnly={readOnly} />
        </div>
      );
    case 'prescription':
      return (
        <div className="space-y-3">
          <PrescriptionEditor
            record={record}
            draft={draft}
            setDraft={setDraft}
            prescriptions={record?.prescriptions || []}
            compounds={record?.prescription_compounds || []}
            medicines={medicineList}
            onAdd={onAddPrescription}
            onDelete={onDeletePrescription}
            onAddCompound={onAddPrescriptionCompound}
            onDeleteCompound={onDeletePrescriptionCompound}
            onSubmitOrder={onSubmitPrescriptionOrder}
            onCancelOrder={onCancelPrescriptionOrder}
            onPrintOrder={onPrintPrescriptionOrder}
            onPrintTicket={onPrintPrescriptionTicket}
            canCancelOrder={canCancelPrescriptionOrder}
            actionState={prescriptionActionState}
            readOnly={readOnly}
          />
        </div>
      );
    case 'procedure':
      return (
        <div className="space-y-3">
          <ProcedureEditor
            actions={record?.actions || []}
            services={serviceList}
            odontogramEntries={odontogramEntries}
            onAdd={onAddAction}
            onUpdate={onUpdateAction}
            onDelete={onDeleteAction}
            onPrint={onPrintProcedure}
            printing={procedureActionState?.printing}
            readOnly={readOnly}
          />
          <TableSection title="Catatan Entri Tindakan">
            <TableRow>
              <TableCell label="Catatan Tindakan" colSpan={4}>
                <TextEditor label="Catatan Tindakan" hideLabel value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
          </TableSection>
        </div>
      );
    case 'laboratory':
      return (
        <div className="space-y-3">
          <LaboratoryOrderEditor
            record={record}
            items={record?.laboratory_order_items || []}
            services={serviceList}
            onAdd={onAddLaboratoryOrderItem}
            onDelete={onDeleteLaboratoryOrderItem}
            onCancelOrder={onCancelLaboratoryOrder}
            onPrintTicket={onPrintLaboratoryTicket}
            onPrintResult={onPrintLaboratoryResult}
            canCancelOrder={canCancelLaboratoryOrder}
            actionState={laboratoryActionState}
            readOnly={readOnly}
          />
          <TableSection title="Catatan Order Laboratorium">
            <TableRow>
              <TableCell label="Catatan Order" colSpan={4}>
                <TextEditor label="Catatan Order" hideLabel value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
          </TableSection>
        </div>
      );
    case 'radiology':
      return (
        <div className="space-y-3">
          <RadiologyOrderEditor
            record={record}
            items={record?.radiology_order_items || []}
            services={serviceList}
            onAdd={onAddRadiologyOrderItem}
            onDelete={onDeleteRadiologyOrderItem}
            onCancelOrder={onCancelRadiologyOrder}
            onPrintTicket={onPrintRadiologyTicket}
            onPrintResult={onPrintRadiologyResult}
            canCancelOrder={canCancelRadiologyOrder}
            actionState={radiologyActionState}
            readOnly={readOnly}
          />
           <TableSection title="Catatan Order Radiologi">
            <TableRow>
              <TableCell label="Catatan Order" colSpan={4}>
                <TextEditor label="Catatan Order" hideLabel value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
          </TableSection>
        </div>
      );
    case 'outcome':
      if (variant === 'surat') {
        return renderSuratOutcome(draft, setDraft, record, readOnly);
      }

      return (
        <div className="space-y-0">
          <TableSection title="Outcome Kunjungan">
            <TableRow>
              <TableCell label="Disposition">
                <SearchableSelect options={DISPOSITION_OPTIONS} value={draft.disposition} onValueChange={(value) => setDraft((prev) => ({ ...prev, disposition: value }))} placeholder="Pilih disposition" disabled={readOnly} square className={PAPER_SELECT_TRIGGER_CLASSNAME} />
              </TableCell>
              <TableCell label="Kondisi Akhir Kunjungan" colSpan={2}>
                <TextEditor label="Kondisi Akhir Kunjungan" hideLabel value={draft.discharge_condition} onChange={(value) => setDraft((prev) => ({ ...prev, discharge_condition: value }))} disabled={readOnly} rows={3} />
              </TableCell>
              <TableCell label="Catatan Outcome">
                <TextEditor label="Catatan Outcome" hideLabel value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} disabled={readOnly} rows={3} />
              </TableCell>
            </TableRow>
            {draft.disposition === 'rujuk' && (
              <TableRow>
                <TableCell label="Tujuan Rujukan" colSpan={2}>
                  <TextEditor label="Tujuan Rujukan" hideLabel value={draft.referral_destination} onChange={(value) => setDraft((prev) => ({ ...prev, referral_destination: value }))} disabled={readOnly} rows={3} />
                </TableCell>
                <TableCell label="Alasan Rujukan" colSpan={2}>
                  <TextEditor label="Alasan Rujukan" hideLabel value={draft.referral_reason} onChange={(value) => setDraft((prev) => ({ ...prev, referral_reason: value }))} disabled={readOnly} rows={3} />
                </TableCell>
              </TableRow>
            )}
          </TableSection>
        </div>
      );
    default:
      return null;
  }
}
