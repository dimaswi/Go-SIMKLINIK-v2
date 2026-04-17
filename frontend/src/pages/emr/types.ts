import type { ComponentType } from 'react';
import type { MedicalRecordPhysicalExamImage, MedicalRecordSectionType } from '@/lib/api';

export type MedicalRecordDraft = {
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history: string;
  past_surgical_history: string;
  family_history: string;
  medication_history: string;
  social_history: string;
  review_of_systems: string;
  clinical_alert: string;
  allergy_notes: string;
  subjective: string;
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  spo2: number;
  pain_scale_type: string;
  pain_scale: number;
  consciousness: string;
  height: number;
  weight: number;
  physical_examination: string;
  supporting_examination: string;
  physical_exam_images: MedicalRecordPhysicalExamImage[];
  working_diagnosis: string;
  differential_diagnosis: string;
  assessment: string;
  plan: string;
  follow_up_instruction: string;
  follow_up_at: string;
  prescription_fulfillment_mode: '' | 'internal' | 'print';
  disposition: string;
  discharge_condition: string;
  referral_destination: string;
  referral_reason: string;
  notes: string;
};

export type SectionConfig = {
  key: MedicalRecordSectionType;
  label: string;
  description: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
};

export type MedicalSheetKey =
  | 'face-sheet'
  | 'general-consent'
  | 'hak-dan-kewajiban'
  | 'pengkajian-awal-keperawatan'
  | 'pengkajian-awal-medis'
  | 'pengkajian-awal-gigi'
  | 'odontogram'
  | 'cppt'
  | 'lembar-penunjang'
  | 'lembar-resep-terapi'
  | 'surat'
  | 'informed-consent'
  | 'lembar-tindakan-kecil'
  | 'resume-medis';

export type MedicalSheetKind = 'section-editor' | 'resume' | 'consent' | 'placeholder' | 'odontogram';
export type MedicalSheetAvailability = 'ready' | 'partial' | 'planned';

export type MedicalSheetConfig = {
  key: MedicalSheetKey;
  label: string;
  description: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  kind: MedicalSheetKind;
  availability: MedicalSheetAvailability;
  sections: MedicalRecordSectionType[];
  defaultSection?: MedicalRecordSectionType;
};

export type SectionStatusTone = 'muted' | 'warning' | 'info' | 'success';
