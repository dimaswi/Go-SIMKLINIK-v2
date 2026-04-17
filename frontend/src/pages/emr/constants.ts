import {
  Activity,
  BookText,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileSignature,
  FileText,
  FlaskConical,
  NotebookText,
  Pill,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserRound,
} from 'lucide-react';
import type { MedicalRecordSectionType, MedicalRecordSheetKey } from '@/lib/api';
import type { MedicalRecordDraft, MedicalSheetConfig, MedicalSheetKey, SectionConfig } from './types';

const INITIAL_ASSESSMENT_ENTRY_FILTERS: Partial<Record<MedicalSheetKey, { sheetKey: MedicalRecordSheetKey; entryGroupPrefix: string; includeLegacy: boolean }>> = {
  'pengkajian-awal-medis': { sheetKey: 'pengkajian-awal-medis', entryGroupPrefix: 'pengkajian-awal', includeLegacy: true },
  'pengkajian-awal-gigi': { sheetKey: 'pengkajian-awal-gigi', entryGroupPrefix: 'pengkajian-gigi', includeLegacy: false },
  surat: { sheetKey: 'surat', entryGroupPrefix: 'surat', includeLegacy: false },
};

export function isInitialAssessmentSheetKey(key: MedicalSheetKey) {
  return Boolean(INITIAL_ASSESSMENT_ENTRY_FILTERS[key]);
}

export function getInitialAssessmentEntryFilter(key: MedicalSheetKey) {
  return INITIAL_ASSESSMENT_ENTRY_FILTERS[key] || null;
}

export const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: 'anamnesis',
    label: 'Anamnesis',
    description: 'Keluhan, riwayat penyakit, obat, kebiasaan, dan konteks pasien.',
    helper: 'Satu kunjungan dapat memiliki beberapa entri anamnesis atau addendum.',
    icon: UserRound,
  },
  {
    key: 'physical_exam',
    label: 'Pemeriksaan Fisik',
    description: 'Tanda vital, temuan objektif, dan pemeriksaan penunjang.',
    helper: 'Gunakan untuk pemeriksaan awal maupun pembaruan objektif.',
    icon: Activity,
  },
  {
    key: 'assessment',
    label: 'Assessment',
    description: 'Diagnosis kerja, diagnosis banding, dan ICD-10.',
    helper: 'Dapat dipakai untuk revisi penilaian klinis dalam satu kunjungan.',
    icon: Stethoscope,
  },
  {
    key: 'prescription',
    label: 'Resep',
    description: 'Batch resep obat yang diterbitkan dalam kunjungan ini.',
    helper: 'Satu entri resep dapat berisi banyak item obat.',
    icon: Pill,
  },
  {
    key: 'laboratory',
    label: 'Laboratorium',
    description: 'Order pemeriksaan laboratorium beserta hasil yang kembali ke rekam medis.',
    helper: 'Satu entri laboratorium dapat berisi banyak item pemeriksaan.',
    icon: FlaskConical,
  },
  {
    key: 'radiology',
    label: 'Radiologi',
    description: 'Order pemeriksaan radiologi beserta laporan hasil penunjang.',
    helper: 'Satu entri radiologi dapat berisi banyak item pemeriksaan.',
    icon: ScanLine,
  },
  {
    key: 'procedure',
    label: 'Tindakan',
    description: 'Tindakan atau layanan medis yang dilakukan.',
    helper: 'Gunakan untuk batch tindakan atau addendum tindakan.',
    icon: Syringe,
  },
  {
    key: 'outcome',
    label: 'Outcome',
    description: 'Disposisi akhir kunjungan, kondisi pasien, dan rujukan.',
    helper: 'Outcome dibutuhkan saat finalisasi kunjungan.',
    icon: CheckCircle2,
  },
];

export const SHEET_CONFIGS: MedicalSheetConfig[] = [
  {
    key: 'face-sheet',
    label: 'Ringkasan Masuk & Keluar',
    description: 'Identitas pasien, kunjungan, penjamin, alergi penting, dan status pulang/rujuk.',
    helper: 'Menjadi dasar face sheet untuk cetak ringkas kunjungan.',
    icon: FileText,
    kind: 'placeholder',
    availability: 'planned',
    sections: ['anamnesis', 'outcome'],
  },
  {
    key: 'general-consent',
    label: 'General Consent',
    description: 'Persetujuan pelayanan umum, privasi, dan administrasi dasar pasien.',
    helper: 'Disiapkan sebagai lembar administratif tersendiri.',
    icon: ShieldCheck,
    kind: 'placeholder',
    availability: 'planned',
    sections: [],
  },
  {
    key: 'hak-dan-kewajiban',
    label: 'Hak & Kewajiban Pasien',
    description: 'Pernyataan bahwa pasien atau wali telah menerima penjelasan hak dan kewajiban.',
    helper: 'Ditetapkan sebagai lembar administratif terpisah.',
    icon: BookText,
    kind: 'placeholder',
    availability: 'planned',
    sections: [],
  },
  {
    key: 'pengkajian-awal-keperawatan',
    label: 'Pengkajian Awal Keperawatan',
    description: 'Skrining awal keperawatan, nyeri, kebutuhan edukasi, dan observasi dasar.',
    helper: 'Lembar khusus perawat akan ditambahkan setelah struktur dokter stabil.',
    icon: ClipboardList,
    kind: 'placeholder',
    availability: 'planned',
    sections: ['anamnesis', 'physical_exam'],
  },
  {
    key: 'pengkajian-awal-medis',
    label: 'Pengkajian Awal Medis',
    description: 'Menggabungkan anamnesis, pemeriksaan fisik, dan assessment awal dokter.',
    helper: 'Ini menjadi lembar inti pemeriksaan dokter pada kunjungan klinik pratama/spesialis.',
    icon: Stethoscope,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['anamnesis', 'physical_exam', 'assessment'],
    defaultSection: 'anamnesis',
  },
  {
    key: 'pengkajian-awal-gigi',
    label: 'Pengkajian Awal Gigi',
    description: 'Pisahkan anamnesis, pemeriksaan intraoral, dan assessment awal khusus kasus gigi.',
    helper: 'Gunakan lembar ini untuk paket pengkajian odontologi tanpa bercampur dengan paket pengkajian awal umum.',
    icon: Stethoscope,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['anamnesis', 'physical_exam', 'assessment'],
    defaultSection: 'anamnesis',
  },
  {
    key: 'odontogram',
    label: 'Odontogram',
    description: 'Chart SVG responsif per gigi dan per permukaan untuk dokumentasi kondisi gigi secara terstruktur.',
    helper: 'Setiap entri menyimpan snapshot odontogram tersendiri. Klik kanan pada permukaan SVG untuk menandai karies, restorasi, fraktur, dan kondisi lain.',
    icon: ClipboardList,
    kind: 'odontogram',
    availability: 'ready',
    sections: [],
  },
  {
    key: 'cppt',
    label: 'CPPT',
    description: 'Catatan perkembangan pasien terintegrasi selama observasi atau tindak lanjut kunjungan.',
    helper: 'Akan menjadi lembar multi-profesi setelah model catatan terpisah ditambahkan.',
    icon: NotebookText,
    kind: 'placeholder',
    availability: 'planned',
    sections: ['assessment', 'outcome'],
  },
  {
    key: 'lembar-penunjang',
    label: 'Lembar Penunjang',
    description: 'Permintaan dan hasil penunjang seperti lab, radiologi, EKG, atau lampiran lainnya.',
    helper: 'Dokter membuat order dari EMR, lalu unit laboratorium atau radiologi memproses dan mengembalikan hasil ke lembar ini.',
    icon: Activity,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['laboratory', 'radiology'],
    defaultSection: 'laboratory',
  },
  {
    key: 'lembar-resep-terapi',
    label: 'Lembar Resep & Terapi',
    description: 'Order resep dokter ke farmasi internal atau resep luar, termasuk racikan dan non-racikan.',
    helper: 'Satu entri resep memuat mode pemenuhan, item non-racikan, obat racikan, dan status order/dispensing.',
    icon: Pill,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['prescription'],
    defaultSection: 'prescription',
  },
  {
    key: 'surat',
    label: 'Surat',
    description: 'Penerbitan surat klinis pasien: surat sakit, surat sehat, MCU, dan buta warna.',
    helper: 'Pilih jenis surat sesuai kebutuhan kunjungan, cek data klinis pendukung, lalu lanjut ke alur pembuatan surat.',
    icon: FileCheck2,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['assessment', 'outcome'],
    defaultSection: 'assessment',
  },
  {
    key: 'informed-consent',
    label: 'Informed Consent',
    description: 'Persetujuan tindakan invasif atau operasi kecil berikut risiko, manfaat, dan keputusan pasien.',
    helper: 'Draft consent yang dibuat otomatis dari tindakan yang membutuhkan persetujuan akan ditampilkan di sini.',
    icon: FileSignature,
    kind: 'consent',
    availability: 'ready',
    sections: ['procedure'],
  },
  {
    key: 'lembar-tindakan-kecil',
    label: 'Lembar Tindakan / Operasi Kecil',
    description: 'Bundle tindakan kecil: tindakan yang dilakukan dan dokumen consent terkait.',
    helper: 'Outcome akhir kunjungan akan diisi saat finalisasi kunjungan, bukan dari lembar tindakan ini.',
    icon: Syringe,
    kind: 'section-editor',
    availability: 'ready',
    sections: ['procedure'],
    defaultSection: 'procedure',
  },
  {
    key: 'resume-medis',
    label: 'Resume Medis',
    description: 'Finalisasi akhir kunjungan dan data pasien pulang untuk resume klinis.',
    helper: 'Form ini fokus pada outcome akhir; ringkasan klinis tetap diambil dari lembar inti yang sudah terisi.',
    icon: CheckCircle2,
    kind: 'resume',
    availability: 'ready',
    sections: ['anamnesis', 'assessment', 'prescription', 'procedure', 'outcome'],
    defaultSection: 'outcome',
  },
];

export const VISIBLE_SHEET_CONFIGS = SHEET_CONFIGS.filter(
  (sheet) => sheet.availability === 'ready' && sheet.key !== 'resume-medis'
);
export const CORE_COMPLETION_TOTAL = 3;

export const SURAT_TYPE_OPTIONS = [
  {
    value: 'surat-sakit',
    label: 'Surat Sakit',
    shortLabel: 'Sakit',
    description: 'Dipakai untuk keterangan istirahat karena kondisi medis sementara.',
    supportHint: 'Idealnya didukung anamnesis, temuan pemeriksaan, dan rencana kontrol.',
    accentClassName: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  {
    value: 'surat-sehat',
    label: 'Surat Sehat',
    shortLabel: 'Sehat',
    description: 'Dipakai untuk menyatakan pasien dalam kondisi layak/fit sesuai kebutuhan administratif.',
    supportHint: 'Idealnya didukung pemeriksaan fisik ringkas dan outcome kunjungan.',
    accentClassName: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  {
    value: 'surat-mcu',
    label: 'Surat MCU',
    shortLabel: 'MCU',
    description: 'Dipakai untuk ringkasan hasil medical check-up sesuai paket pemeriksaan.',
    supportHint: 'Idealnya didukung pemeriksaan fisik, penunjang, serta kesimpulan assessment.',
    accentClassName: 'border-sky-300 bg-sky-50 text-sky-800',
  },
  {
    value: 'surat-buta-warna',
    label: 'Surat Buta Warna',
    shortLabel: 'Buta Warna',
    description: 'Dipakai untuk hasil skrining buta warna parsial/total sesuai hasil tes.',
    supportHint: 'Idealnya didukung catatan metode tes dan hasil interpretasi klinis.',
    accentClassName: 'border-violet-300 bg-violet-50 text-violet-800',
  },
] as const;

export type SuratTypeOptionValue = (typeof SURAT_TYPE_OPTIONS)[number]['value'];

export const EMPTY_DRAFT: MedicalRecordDraft = {
  chief_complaint: '',
  history_of_present_illness: '',
  past_medical_history: '',
  past_surgical_history: '',
  family_history: '',
  medication_history: '',
  social_history: '',
  review_of_systems: '',
  clinical_alert: '',
  allergy_notes: '',
  subjective: '',
  bp_systolic: 0,
  bp_diastolic: 0,
  heart_rate: 0,
  temperature: 0,
  respiratory_rate: 0,
  spo2: 0,
  pain_scale_type: 'nrs',
  pain_scale: 0,
  consciousness: 'compos mentis',
  height: 0,
  weight: 0,
  physical_examination: '',
  supporting_examination: '',
  physical_exam_images: [],
  working_diagnosis: '',
  differential_diagnosis: '',
  assessment: '',
  plan: '',
  follow_up_instruction: '',
  follow_up_at: '',
  prescription_fulfillment_mode: '',
  disposition: '',
  discharge_condition: '',
  referral_destination: '',
  referral_reason: '',
  notes: '',
};

export const CONSCIOUSNESS_OPTIONS = [
  { value: 'compos mentis', label: 'Compos Mentis' },
  { value: 'somnolen', label: 'Somnolen' },
  { value: 'sopor', label: 'Sopor' },
  { value: 'coma', label: 'Coma' },
];

export const PAIN_SCALE_TYPE_OPTIONS = [
  { value: 'nrs', label: 'NRS (Numeric Rating Scale)' },
  { value: 'wong-baker', label: 'Wong Baker Faces' },
  { value: 'vas', label: 'VAS (Visual Analog Scale)' },
  { value: 'flacc', label: 'FLACC' },
  { value: 'vrs', label: 'VRS (Verbal Rating Scale)' },
];

const PAIN_SCALE_VALUE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  nrs: Array.from({ length: 11 }, (_, value) => ({
    value: String(value),
    label: `${value} - ${value === 0 ? 'Tidak nyeri' : value <= 3 ? 'Nyeri ringan' : value <= 6 ? 'Nyeri sedang' : 'Nyeri berat'}`,
  })),
  vas: Array.from({ length: 11 }, (_, value) => ({
    value: String(value),
    label: `${value} cm - ${value === 0 ? 'Tidak nyeri' : value <= 3 ? 'Nyeri ringan' : value <= 6 ? 'Nyeri sedang' : 'Nyeri berat'}`,
  })),
  flacc: Array.from({ length: 11 }, (_, value) => ({
    value: String(value),
    label: `${value} - ${value === 0 ? 'Nyaman' : value <= 3 ? 'Nyeri ringan' : value <= 6 ? 'Nyeri sedang' : 'Nyeri berat'}`,
  })),
  'wong-baker': [
    { value: '0', label: '0 - Sangat nyaman / tidak nyeri' },
    { value: '2', label: '2 - Sedikit nyeri' },
    { value: '4', label: '4 - Agak lebih nyeri' },
    { value: '6', label: '6 - Lebih nyeri' },
    { value: '8', label: '8 - Sangat nyeri' },
    { value: '10', label: '10 - Nyeri amat sangat' },
  ],
  vrs: [
    { value: '0', label: '0 - Tidak nyeri' },
    { value: '1', label: '1 - Nyeri ringan' },
    { value: '2', label: '2 - Nyeri sedang' },
    { value: '3', label: '3 - Nyeri berat' },
    { value: '4', label: '4 - Nyeri sangat berat' },
  ],
};

export function getPainScaleValueOptions(scaleType?: string) {
  return PAIN_SCALE_VALUE_OPTIONS[scaleType || 'nrs'] || PAIN_SCALE_VALUE_OPTIONS.nrs;
}

export const DISPOSITION_OPTIONS = [
  { value: 'rawat_jalan', label: 'Pulang / Rawat Jalan' },
  { value: 'kontrol', label: 'Kontrol Ulang' },
  { value: 'observasi', label: 'Observasi' },
  { value: 'rujuk', label: 'Rujuk' },
  { value: 'rawat_inap', label: 'Rawat Inap' },
];

export const PRESCRIPTION_ROUTE_OPTIONS = [
  { value: 'oral', label: 'Oral' },
  { value: 'topikal', label: 'Topikal' },
  { value: 'injeksi', label: 'Injeksi' },
  { value: 'inhalasi', label: 'Inhalasi' },
];

export const PRESCRIPTION_FREQUENCY_OPTIONS = [
  '1x sehari',
  '2x sehari',
  '3x sehari',
  '4x sehari',
  '1x seminggu',
  'Bila perlu',
  'Pagi hari',
  'Malam hari',
].map((value) => ({ value, label: value }));

export const PRESCRIPTION_DURATION_OPTIONS = [
  '1 hari',
  '3 hari',
  '5 hari',
  '7 hari',
  '10 hari',
  '14 hari',
  '30 hari',
  'Sampai habis',
].map((value) => ({ value, label: value }));

export const PRESCRIPTION_INSTRUCTION_OPTIONS = [
  'Sebelum makan',
  'Sesudah makan',
  'Saat makan',
  'Bila perlu',
  'Kocok dahulu',
  'Larutkan terlebih dahulu',
  'Oles tipis',
  'Teteskan sesuai kebutuhan',
].map((value) => ({ value, label: value }));

export const PRESCRIPTION_FULFILLMENT_OPTIONS = [
  { value: 'internal', label: 'Order Internal Farmasi' },
  { value: 'print', label: 'Cetak Resep Luar' },
];

export const PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS = [
  { value: 'puyer', label: 'Puyer' },
  { value: 'kapsul_racik', label: 'Kapsul Racik' },
  { value: 'sirup_racik', label: 'Sirup Racik' },
  { value: 'salep_racik', label: 'Salep Racik' },
  { value: 'serbuk_bagi', label: 'Serbuk Bagi' },
];

export function getPrescriptionFulfillmentLabel(mode?: string) {
  switch (mode) {
    case 'internal':
      return 'Order Internal';
    case 'print':
      return 'Cetak Resep';
    default:
      return 'Mode belum dipilih';
  }
}

export function getPrescriptionWorkflowLabel(status?: string) {
  switch (status) {
    case 'ordered':
      return 'Dikirim ke farmasi';
    case 'preparing':
      return 'Sedang disiapkan';
    case 'ready':
      return 'Siap diambil';
    case 'dispensed':
      return 'Sudah diserahkan';
    case 'printed':
      return 'Sudah dicetak';
    case 'draft':
    default:
      return 'Draft';
  }
}

export function getPrescriptionWorkflowBadgeClassName(status?: string) {
  switch (status) {
    case 'ordered':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'preparing':
      return 'border-sky-300 bg-sky-50 text-sky-700';
    case 'ready':
      return 'border-indigo-300 bg-indigo-50 text-indigo-700';
    case 'dispensed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'printed':
      return 'border-violet-300 bg-violet-50 text-violet-700';
    case 'draft':
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700';
  }
}

export function getSupportingOrderWorkflowLabel(status?: string) {
  switch (status) {
    case 'ordered':
      return 'Dikirim ke unit';
    case 'preparing':
      return 'Sedang diproses';
    case 'completed':
      return 'Hasil selesai';
    case 'draft':
    default:
      return 'Draft';
  }
}

export function getSupportingOrderWorkflowBadgeClassName(status?: string) {
  switch (status) {
    case 'ordered':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'preparing':
      return 'border-sky-300 bg-sky-50 text-sky-700';
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'draft':
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700';
  }
}

export function getSectionConfig(sectionType: MedicalRecordSectionType) {
  return SECTION_CONFIGS.find((section) => section.key === sectionType) || SECTION_CONFIGS[0];
}

export function getSheetConfig(sheetKey: MedicalSheetKey) {
  return SHEET_CONFIGS.find((sheet) => sheet.key === sheetKey) || SHEET_CONFIGS[0];
}
