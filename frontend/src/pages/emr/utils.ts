import type { InformedConsent, MedicalRecord, MedicalRecordSectionType, MedicalRecordSheetKey, SatusehatAutoSyncResourceResult, SatusehatVisitAutoSyncResult, Visit } from '@/lib/api';
import { isLaboratoryOrderItemCompleted } from '@/lib/laboratory';
import { EMPTY_DRAFT, SECTION_CONFIGS, getInitialAssessmentEntryFilter, getPrescriptionFulfillmentLabel, getPrescriptionWorkflowLabel, getSupportingOrderWorkflowLabel, isInitialAssessmentSheetKey } from './constants';
import type { MedicalRecordDraft, MedicalSheetConfig, SectionStatusTone } from './types';

type SheetEntryFilter = {
  sheetKey?: MedicalRecordSheetKey;
  entryGroupPrefix?: string;
  includeLegacy?: boolean;
};

export type VisitInformedConsent = InformedConsent & {
  source_record_id: number;
  source_section_type: MedicalRecordSectionType;
  source_record_status: MedicalRecord['status'];
};

function normalizeRecordSheetKey(sheetKey?: string | null) {
  return (sheetKey || '').trim().toLowerCase();
}

function matchesEntryGroupFilter(entryGroupKey: string, filter?: SheetEntryFilter) {
  if (!filter?.entryGroupPrefix) {
    return true;
  }

  return entryGroupKey === filter.entryGroupPrefix || entryGroupKey.startsWith(`${filter.entryGroupPrefix}-`);
}

function matchesRecordSheetFilter(record: MedicalRecord, filter?: SheetEntryFilter) {
  if (!filter) {
    return true;
  }

  const normalizedSheetKey = normalizeRecordSheetKey(record.sheet_key);
  if (filter.sheetKey && normalizedSheetKey) {
    return normalizedSheetKey === filter.sheetKey;
  }

  const entryGroupKey = (record.entry_group_key || '').trim();
  if (!entryGroupKey) {
    return Boolean(filter.sheetKey === 'pengkajian-awal-medis' && filter.includeLegacy);
  }

  return matchesEntryGroupFilter(entryGroupKey, filter);
}

function getSheetEntryFilter(sheet: MedicalSheetConfig): SheetEntryFilter | undefined {
  if (!isInitialAssessmentSheetKey(sheet.key)) {
    return undefined;
  }

  return getInitialAssessmentEntryFilter(sheet.key) || undefined;
}

export function getPrimaryDiagnosis(record?: MedicalRecord) {
  return record?.diagnoses?.find((diagnosis) => diagnosis.diagnosis_type === 'primer') || record?.diagnoses?.[0];
}

export function formatDateTime(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeCompact(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPatientAge(birthDate?: string) {
  if (!birthDate) return null;

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function compactAddress(parts: Array<string | undefined>) {
  return parts.map((part) => (part || '').trim()).filter(Boolean).join(', ');
}

export function formatDateTimeLocal(value?: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function getMedicalRecordTimestamp(record: MedicalRecord) {
  return new Date(record.updated_at || record.created_at || record.record_date).getTime();
}

export function isMedicalRecordCancelled(record?: MedicalRecord | null) {
  return record?.status === 'cancelled';
}

export function canCancelMedicalRecord(record?: MedicalRecord | null) {
  if (!record || record.status === 'final' || record.status === 'cancelled') {
    return false;
  }

  const sectionType = record.section_type as MedicalRecordSectionType;
  if (sectionType === 'prescription') {
    return !record.prescription_workflow_status || record.prescription_workflow_status === 'draft';
  }
  if (sectionType === 'laboratory') {
    return !record.laboratory_workflow_status || record.laboratory_workflow_status === 'draft';
  }
  if (sectionType === 'radiology') {
    return !record.radiology_workflow_status || record.radiology_workflow_status === 'draft';
  }

  return true;
}

export function sortMedicalRecords(records: MedicalRecord[]) {
  return [...records].sort((left, right) => getMedicalRecordTimestamp(right) - getMedicalRecordTimestamp(left));
}

export function hasText(...values: Array<string | undefined>) {
  return values.some((value) => (value || '').trim() !== '');
}

export function hasObjectiveData(record: MedicalRecord) {
  return Boolean(
    record.bp_systolic ||
      record.bp_diastolic ||
      record.heart_rate ||
      record.temperature ||
      record.respiratory_rate ||
      record.spo2 ||
      record.height ||
      record.weight ||
      record.physical_exam_images?.length ||
      hasText(record.physical_examination, record.supporting_examination)
  );
}

export function isRecordComplete(section: MedicalRecordSectionType, record: MedicalRecord) {
  switch (section) {
    case 'anamnesis':
      return hasText(
        record.chief_complaint,
        record.history_of_present_illness,
        record.past_medical_history,
        record.medication_history,
        record.subjective
      );
    case 'physical_exam':
      return hasObjectiveData(record);
    case 'assessment':
      return hasText(record.working_diagnosis, record.differential_diagnosis, record.assessment) || Boolean(record.diagnoses?.length);
    case 'prescription':
      return Boolean((record.prescriptions?.length || 0) + (record.prescription_compounds?.length || 0)) && Boolean(record.prescription_fulfillment_mode);
    case 'laboratory':
      return Boolean(record.laboratory_order_items?.length);
    case 'radiology':
      return Boolean(record.radiology_order_items?.length);
    case 'procedure':
      return Boolean(record.actions?.length) || hasText(record.notes);
    case 'outcome':
      return hasText(record.disposition, record.discharge_condition) && (record.disposition !== 'rujuk' || (hasText(record.referral_destination) && hasText(record.referral_reason)));
    default:
      return false;
  }
}

export function getSectionSummary(record?: MedicalRecord) {
  if (!record) return '-';

  switch (record.section_type as MedicalRecordSectionType) {
    case 'anamnesis':
      return record.chief_complaint || record.history_of_present_illness || record.subjective || 'Draft anamnesis';
    case 'physical_exam': {
      const vitals = [
        record.bp_systolic && record.bp_diastolic ? `TD ${record.bp_systolic}/${record.bp_diastolic}` : '',
        record.temperature ? `Suhu ${record.temperature}` : '',
        record.heart_rate ? `Nadi ${record.heart_rate}` : '',
      ].filter(Boolean);
      if (vitals.length > 0) return vitals.join(' · ');
      if (record.physical_examination) return record.physical_examination;
      if (record.physical_exam_images?.length) return `${record.physical_exam_images.length} gambar pemeriksaan dipilih`;
      return 'Draft pemeriksaan fisik';
    }
    case 'assessment':
      return record.working_diagnosis || getPrimaryDiagnosis(record)?.working_diagnosis || record.differential_diagnosis || getPrimaryDiagnosis(record)?.differential_diagnosis || getPrimaryDiagnosis(record)?.icd10?.name_id || record.assessment || getPrimaryDiagnosis(record)?.assessment_narrative || 'Draft assessment';
    case 'prescription':
      return getPrescriptionRecordSummary(record);
    case 'laboratory':
      return getLaboratoryRecordSummary(record);
    case 'radiology':
      return getRadiologyRecordSummary(record);
    case 'procedure':
      return record.actions?.length ? `${record.actions.length} tindakan tercatat` : record.notes || 'Belum ada tindakan';
    case 'outcome':
      return record.disposition || record.discharge_condition || 'Draft outcome';
    default:
      return 'Draft entri';
  }
}

export function buildDraft(record?: MedicalRecord, visit?: Visit): MedicalRecordDraft {
  const primaryDiagnosis = getPrimaryDiagnosis(record);

  return {
    ...EMPTY_DRAFT,
    chief_complaint: record?.chief_complaint || visit?.complaint || '',
    history_of_present_illness: record?.history_of_present_illness || '',
    past_medical_history: record?.past_medical_history || '',
    past_surgical_history: record?.past_surgical_history || '',
    family_history: record?.family_history || '',
    medication_history: record?.medication_history || '',
    social_history: record?.social_history || '',
    review_of_systems: record?.review_of_systems || '',
    clinical_alert: record?.clinical_alert || '',
    allergy_notes: record?.allergy_notes || visit?.patient?.allergies || '',
    subjective: record?.subjective || visit?.complaint || '',
    bp_systolic: record?.bp_systolic || 0,
    bp_diastolic: record?.bp_diastolic || 0,
    heart_rate: record?.heart_rate || 0,
    temperature: record?.temperature || 0,
    respiratory_rate: record?.respiratory_rate || 0,
    spo2: record?.spo2 || 0,
    pain_scale_type: record?.pain_scale_type || 'nrs',
    pain_scale: record?.pain_scale || 0,
    consciousness: record?.consciousness || 'compos mentis',
    height: record?.height || 0,
    weight: record?.weight || 0,
    physical_examination: record?.physical_examination || '',
    supporting_examination: record?.supporting_examination || '',
    physical_exam_images: (record?.physical_exam_images || []).map((item, index) => ({
      id: item.id,
      medical_record_id: item.medical_record_id,
      physical_exam_image_master_id: item.physical_exam_image_master_id,
      notes: item.notes || '',
      sort_order: item.sort_order || index + 1,
      master: item.master,
      markers: (item.markers || []).map((marker) => ({
        id: marker.id,
        medical_record_image_pick_id: marker.medical_record_image_pick_id,
        marker_label: marker.marker_label || '',
        pos_x: marker.pos_x,
        pos_y: marker.pos_y,
      })),
    })),
    working_diagnosis: record?.working_diagnosis || primaryDiagnosis?.working_diagnosis || '',
    differential_diagnosis: record?.differential_diagnosis || primaryDiagnosis?.differential_diagnosis || '',
    assessment: record?.assessment || primaryDiagnosis?.assessment_narrative || '',
    plan: record?.plan || '',
    follow_up_instruction: record?.follow_up_instruction || '',
    follow_up_at: formatDateTimeLocal(record?.follow_up_at),
    prescription_fulfillment_mode: record?.prescription_fulfillment_mode || '',
    disposition: record?.disposition || '',
    discharge_condition: record?.discharge_condition || '',
    referral_destination: record?.referral_destination || '',
    referral_reason: record?.referral_reason || '',
    notes: record?.notes || '',
  };
}

export function groupRecordsBySection(records: MedicalRecord[]) {
  const grouped = SECTION_CONFIGS.reduce((accumulator, section) => {
    accumulator[section.key] = [];
    return accumulator;
  }, {} as Record<MedicalRecordSectionType, MedicalRecord[]>);

  for (const record of records) {
    const sectionType = record.section_type as MedicalRecordSectionType;
    if (!grouped[sectionType]) {
      grouped[sectionType] = [];
    }

    grouped[sectionType].push(record);
  }

  for (const sectionType of Object.keys(grouped) as MedicalRecordSectionType[]) {
    grouped[sectionType] = sortMedicalRecords(grouped[sectionType]);
  }

  return grouped;
}

export type MedicalSheetEntryGroup = {
  key: string;
  records: Partial<Record<MedicalRecordSectionType, MedicalRecord>>;
  recordIds: number[];
  latestTimestamp: number;
};

export function isSheetEntryGroupCancelled(group: MedicalSheetEntryGroup) {
  const records = Object.values(group.records).filter((record): record is MedicalRecord => Boolean(record));
  return records.length > 0 && records.every((record) => isMedicalRecordCancelled(record));
}

export function canCancelSheetEntryGroup(group: MedicalSheetEntryGroup) {
  const records = Object.values(group.records).filter((record): record is MedicalRecord => Boolean(record));
  return records.length > 0 && records.every((record) => canCancelMedicalRecord(record));
}

export function buildSheetEntryGroups(
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>,
  sections: MedicalRecordSectionType[],
  filter?: SheetEntryFilter
) {
  const groupedEntries = new Map<string, MedicalSheetEntryGroup>();
  const legacyRecords = sections.reduce((result, section) => {
    result[section] = [];
    return result;
  }, {} as Record<MedicalRecordSectionType, MedicalRecord[]>);

  for (const section of sections) {
    for (const record of recordsBySection[section] || []) {
      if (!matchesRecordSheetFilter(record, filter)) {
        continue;
      }

      const entryGroupKey = (record.entry_group_key || '').trim();
      if (!entryGroupKey) {
        legacyRecords[section].push(record);
        continue;
      }

      const currentGroup = groupedEntries.get(entryGroupKey) || {
        key: entryGroupKey,
        records: {},
        recordIds: [],
        latestTimestamp: 0,
      };

      if (!currentGroup.records[section]) {
        currentGroup.records[section] = record;
      }
      if (!currentGroup.recordIds.includes(record.id)) {
        currentGroup.recordIds.push(record.id);
      }
      currentGroup.latestTimestamp = Math.max(currentGroup.latestTimestamp, getMedicalRecordTimestamp(record));
      groupedEntries.set(entryGroupKey, currentGroup);
    }
  }

  const legacyGroups: MedicalSheetEntryGroup[] = [];
  const maxLegacyCount = Math.max(0, ...sections.map((section) => legacyRecords[section].length));
  for (let index = 0; index < maxLegacyCount; index += 1) {
    const records: Partial<Record<MedicalRecordSectionType, MedicalRecord>> = {};
    const recordIds: number[] = [];
    let latestTimestamp = 0;

    for (const section of sections) {
      const record = legacyRecords[section][index];
      if (!record) continue;
      records[section] = record;
      recordIds.push(record.id);
      latestTimestamp = Math.max(latestTimestamp, getMedicalRecordTimestamp(record));
    }

    if (recordIds.length > 0) {
      legacyGroups.push({
        key: `legacy-${index + 1}`,
        records,
        recordIds,
        latestTimestamp,
      });
    }
  }

  return [...groupedEntries.values(), ...legacyGroups].sort((left, right) => right.latestTimestamp - left.latestTimestamp);
}

export function getSheetEntryGroupStatus(
  group: MedicalSheetEntryGroup,
  sections: MedicalRecordSectionType[],
  visitLocked: boolean
) {
  if (isSheetEntryGroupCancelled(group)) {
    return { label: 'Batal', tone: 'warning' as SectionStatusTone };
  }

  if (visitLocked && group.recordIds.length > 0) {
    return { label: 'Final', tone: 'success' as SectionStatusTone };
  }

  const availableSections = sections.filter((section) => Boolean(group.records[section]));
  const completedSections = sections.filter((section) => {
    const record = group.records[section];
    return record ? isRecordComplete(section, record) : false;
  }).length;

  if (availableSections.length === 0) {
    return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
  }

  if (completedSections === 0) {
    return { label: 'Draft', tone: 'warning' as SectionStatusTone };
  }

  if (completedSections < sections.length) {
    return { label: 'Terisi', tone: 'info' as SectionStatusTone };
  }

  return { label: 'Lengkap', tone: 'success' as SectionStatusTone };
}

export function getSheetEntryGroupSummary(
  group: MedicalSheetEntryGroup,
  sections: MedicalRecordSectionType[],
  emptyLabel = 'Pengkajian awal belum diisi'
) {
  const anamnesis = group.records.anamnesis;
  const assessment = group.records.assessment;

  if (anamnesis?.chief_complaint) return anamnesis.chief_complaint;
  if (assessment?.working_diagnosis) return assessment.working_diagnosis;
  if (getPrimaryDiagnosis(assessment)?.working_diagnosis) return getPrimaryDiagnosis(assessment)?.working_diagnosis || '-';

  for (const section of sections) {
    const record = group.records[section];
    if (record) {
      return getSectionSummary(record);
    }
  }

  return emptyLabel;
}

export function getSectionRowStatus(section: MedicalRecordSectionType, records: MedicalRecord[], visitLocked: boolean) {
  if (records.length === 0) {
    return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
  }

  if (records.every((record) => isMedicalRecordCancelled(record))) {
    return { label: 'Batal', tone: 'warning' as SectionStatusTone };
  }

  const hasCompleteRecord = records.some((record) => isRecordComplete(section, record));
  const hasDraft = records.some((record) => record.status === 'draft');

  if (visitLocked && records.length > 0) {
    return { label: 'Final', tone: 'success' as SectionStatusTone };
  }

  if (hasDraft && !hasCompleteRecord) {
    return { label: 'Draft', tone: 'warning' as SectionStatusTone };
  }

  if (hasDraft && hasCompleteRecord) {
    return { label: 'Terisi', tone: 'info' as SectionStatusTone };
  }

  return { label: 'Lengkap', tone: 'success' as SectionStatusTone };
}

export function getCompletedCoreSections(recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>) {
  const completion = [
    recordsBySection.anamnesis.some((record) => isRecordComplete('anamnesis', record)),
    recordsBySection.physical_exam.some((record) => isRecordComplete('physical_exam', record)),
    recordsBySection.assessment.some((record) => isRecordComplete('assessment', record)),
  ];

  return completion.filter(Boolean).length;
}

export function getRecordsForSheetSections(
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>,
  sections: MedicalRecordSectionType[],
  filter?: SheetEntryFilter
) {
  return sortMedicalRecords(
    sections.flatMap((section) => (recordsBySection[section] || []).filter((record) => matchesRecordSheetFilter(record, filter)))
  );
}

export function getLatestRecordForSection(
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>,
  section: MedicalRecordSectionType
) {
  return (recordsBySection[section] || [])[0];
}

export function getFinalizeVisitBlockingOrders(recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>) {
  const blockers: string[] = [];

  const hasPendingPharmacy = (recordsBySection.prescription || []).some((record) =>
    record.prescription_fulfillment_mode === 'internal'
      && ['ordered', 'preparing', 'ready'].includes(record.prescription_workflow_status || '')
  );
  const hasPendingLaboratory = (recordsBySection.laboratory || []).some((record) =>
    ['ordered', 'preparing'].includes(record.laboratory_workflow_status || '')
  );
  const hasPendingRadiology = (recordsBySection.radiology || []).some((record) =>
    ['ordered', 'preparing'].includes(record.radiology_workflow_status || '')
  );

  if (hasPendingPharmacy) {
    blockers.push('Order farmasi internal belum selesai.');
  }
  if (hasPendingLaboratory) {
    blockers.push('Order laboratorium belum selesai.');
  }
  if (hasPendingRadiology) {
    blockers.push('Order radiologi belum selesai.');
  }

  return blockers;
}

function formatAutoSyncResourceLabel(resource: SatusehatAutoSyncResourceResult) {
  const parts = [resource.resource_type];

  if (resource.resource_id) {
    parts.push(`#${resource.resource_id}`);
  }
  if (resource.medical_record_id) {
    parts.push(`(MR ${resource.medical_record_id})`);
  }

  return parts.join(' ');
}

export function buildSatusehatAutoSyncSummary(autoSync?: SatusehatVisitAutoSyncResult) {
  if (!autoSync) {
    return {
      description: 'Auto-sync SATUSEHAT selesai diproses.',
      sentItems: [] as string[],
      unsentItems: [] as string[],
    };
  }

  const sentItems = (autoSync.sent_resources || []).map((item) => formatAutoSyncResourceLabel(item));
  const unsentItems = (autoSync.unsent_resources || []).map((item) => {
    const reason = (item.message || '').trim();
    return reason ? `${formatAutoSyncResourceLabel(item)} (${reason})` : formatAutoSyncResourceLabel(item);
  });

  const hasUnsent = autoSync.unsent_count > 0 || unsentItems.length > 0 || Boolean(autoSync.error);
  const errorSummary = autoSync.error ? ` (${autoSync.error})` : '';
  const description = hasUnsent
    ? `Auto-sync SATUSEHAT: ${autoSync.sent_count} terkirim, ${autoSync.unsent_count} belum terkirim. Lihat panel SATUSEHAT untuk detail${errorSummary}.`
    : `Auto-sync SATUSEHAT: ${autoSync.sent_count} resource berhasil dikirim.`;

  return {
    description,
    sentItems,
    unsentItems,
  };
}

function getInformedConsentTimestamp(consent: InformedConsent) {
  return new Date(consent.updated_at || consent.created_at || consent.consent_date || 0).getTime();
}

export function collectVisitInformedConsents(records: MedicalRecord[]): VisitInformedConsent[] {
  return records.flatMap((record) =>
    (record.informed_consents || []).map((consent) => ({
      ...consent,
      source_record_id: record.id,
      source_section_type: record.section_type as MedicalRecordSectionType,
      source_record_status: record.status,
    }))
  ).sort((left, right) => getInformedConsentTimestamp(right) - getInformedConsentTimestamp(left));
}

export function getSheetStatus(
  sheet: MedicalSheetConfig,
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>,
  visitLocked: boolean
) {
  switch (sheet.key) {
    case 'pengkajian-awal-medis':
    case 'pengkajian-awal-gigi': {
      const entryGroups = buildSheetEntryGroups(recordsBySection, sheet.sections, getSheetEntryFilter(sheet));
      if (entryGroups.length === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
      return getSheetEntryGroupStatus(entryGroups[0], sheet.sections, visitLocked);
    }
    case 'resume-medis': {
      const hasOutcome = (recordsBySection.outcome || []).some((record) => isRecordComplete('outcome', record));
      const completedCore = getCompletedCoreSections(recordsBySection);

      if (!hasOutcome && completedCore === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
      if (!hasOutcome) return { label: 'Perlu outcome', tone: 'warning' as SectionStatusTone };
      return { label: visitLocked ? 'Final' : 'Siap cetak', tone: 'success' as SectionStatusTone };
    }
    case 'informed-consent': {
      const consentCount = collectVisitInformedConsents(getRecordsForSheetSections(recordsBySection, sheet.sections)).length;
      if (consentCount === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
      return { label: `${consentCount} consent`, tone: 'info' as SectionStatusTone };
    }
    case 'lembar-tindakan-kecil': {
      const procedureRecords = recordsBySection.procedure || [];
      const hasProcedure = procedureRecords.some((record) => isRecordComplete('procedure', record));
      const consentCount = collectVisitInformedConsents(getRecordsForSheetSections(recordsBySection, ['procedure'])).length;
      const needsConsent = procedureRecords.some((record) => (record.actions || []).some((action) => action.requires_consent_snapshot));
      if (!hasProcedure && consentCount === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
      if (needsConsent && consentCount === 0) return { label: 'Perlu consent', tone: 'warning' as SectionStatusTone };
      return { label: 'Tersedia', tone: 'success' as SectionStatusTone };
    }
    case 'lembar-resep-terapi': {
      const latestPrescription = getLatestRecordForSection(recordsBySection, 'prescription');
      const prescriptionCount = (recordsBySection.prescription || []).reduce((total, record) => total + getPrescriptionRecordItemCount(record), 0);
      if (prescriptionCount === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };

      switch (latestPrescription?.prescription_workflow_status) {
        case 'dispensed':
        case 'printed':
          return { label: getPrescriptionWorkflowLabel(latestPrescription.prescription_workflow_status), tone: 'success' as SectionStatusTone };
        case 'ordered':
        case 'preparing':
        case 'ready':
          return { label: getPrescriptionWorkflowLabel(latestPrescription.prescription_workflow_status), tone: 'info' as SectionStatusTone };
        default:
          return { label: `${prescriptionCount} item`, tone: 'warning' as SectionStatusTone };
      }
    }
    case 'lembar-penunjang': {
      const latestLab = getLatestRecordForSection(recordsBySection, 'laboratory');
      const latestRadiology = getLatestRecordForSection(recordsBySection, 'radiology');
      const labCount = (recordsBySection.laboratory || []).reduce((total, record) => total + getLaboratoryRecordItemCount(record), 0);
      const radiologyCount = (recordsBySection.radiology || []).reduce((total, record) => total + getRadiologyRecordItemCount(record), 0);
      const totalCount = labCount + radiologyCount;

      if (totalCount === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };

      const latestSupporting = sortMedicalRecords([latestLab, latestRadiology].filter(Boolean) as MedicalRecord[])[0];
      const latestStatus = latestSupporting?.section_type === 'laboratory'
        ? latestSupporting?.laboratory_workflow_status
        : latestSupporting?.radiology_workflow_status;

      switch (latestStatus) {
        case 'completed':
          return { label: getSupportingOrderWorkflowLabel(latestStatus), tone: 'success' as SectionStatusTone };
        case 'ordered':
        case 'preparing':
          return { label: getSupportingOrderWorkflowLabel(latestStatus), tone: 'info' as SectionStatusTone };
        default:
          return { label: `${totalCount} item`, tone: 'warning' as SectionStatusTone };
      }
    }
    default: {
      if (sheet.availability === 'planned') {
        return { label: 'Rencana', tone: 'muted' as SectionStatusTone };
      }

      const records = getRecordsForSheetSections(recordsBySection, sheet.sections);
      if (records.length === 0) return { label: 'Belum ada', tone: 'muted' as SectionStatusTone };
      return { label: sheet.availability === 'partial' ? 'Bertahap' : 'Tersedia', tone: 'info' as SectionStatusTone };
    }
  }
}

export function getSheetSummary(
  sheet: MedicalSheetConfig,
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>
) {
  switch (sheet.key) {
    case 'pengkajian-awal-medis':
    case 'pengkajian-awal-gigi': {
      const entryGroups = buildSheetEntryGroups(recordsBySection, sheet.sections, getSheetEntryFilter(sheet));
      if (entryGroups.length === 0) return `${sheet.label} belum dibuat`;
      return getSheetEntryGroupSummary(entryGroups[0], sheet.sections, `${sheet.label.toLowerCase()} belum diisi`);
    }
    case 'resume-medis': {
      const outcome = getLatestRecordForSection(recordsBySection, 'outcome');
      const assessment = getLatestRecordForSection(recordsBySection, 'assessment');
      return outcome?.disposition || assessment?.working_diagnosis || getPrimaryDiagnosis(assessment)?.working_diagnosis || 'Resume medis belum siap';
    }
    case 'informed-consent': {
      const consents = collectVisitInformedConsents(getRecordsForSheetSections(recordsBySection, ['procedure']));
      return consents[0]?.action_name || 'Belum ada informed consent tersimpan';
    }
    case 'lembar-resep-terapi': {
      const latestPrescription = getLatestRecordForSection(recordsBySection, 'prescription');
      return latestPrescription ? getPrescriptionRecordSummary(latestPrescription) : 'Belum ada resep';
    }
    case 'lembar-penunjang': {
      const latestLab = getLatestRecordForSection(recordsBySection, 'laboratory');
      const latestRadiology = getLatestRecordForSection(recordsBySection, 'radiology');
      const latestSupporting = sortMedicalRecords([latestLab, latestRadiology].filter(Boolean) as MedicalRecord[])[0];

      if (!latestSupporting) return 'Belum ada order penunjang';
      return latestSupporting.section_type === 'laboratory'
        ? getLaboratoryRecordSummary(latestSupporting)
        : getRadiologyRecordSummary(latestSupporting);
    }
    case 'lembar-tindakan-kecil': {
      const latestProcedure = getLatestRecordForSection(recordsBySection, 'procedure');
      return latestProcedure ? getSectionSummary(latestProcedure) : 'Belum ada tindakan';
    }
    default:
      return sheet.description;
  }
}

export function getPrescriptionRecordItemCount(record?: MedicalRecord) {
  if (!record) return 0;
  return (record.prescriptions?.length || 0) + (record.prescription_compounds?.length || 0);
}

export function getPrescriptionRecordSummary(record?: MedicalRecord) {
  if (!record) return 'Belum ada item resep';

  const nonCompoundCount = record.prescriptions?.length || 0;
  const compoundCount = record.prescription_compounds?.length || 0;
  const totalCount = nonCompoundCount + compoundCount;

  if (totalCount === 0) {
    return 'Belum ada item resep';
  }

  const parts = [`${totalCount} item`, getPrescriptionFulfillmentLabel(record.prescription_fulfillment_mode), getPrescriptionWorkflowLabel(record.prescription_workflow_status || 'draft')];
  if (compoundCount > 0) {
    parts.splice(1, 0, `${compoundCount} racikan`);
  }

  return parts.filter(Boolean).join(' · ');
}

export function getLaboratoryRecordItemCount(record?: MedicalRecord) {
  if (!record) return 0;
  return record.laboratory_order_items?.length || 0;
}

export function getLaboratoryRecordSummary(record?: MedicalRecord) {
  if (!record) return 'Belum ada item laboratorium';

  const totalCount = record.laboratory_order_items?.length || 0;
  if (totalCount === 0) return 'Belum ada item laboratorium';

  const completedCount = (record.laboratory_order_items || []).filter((item) => isLaboratoryOrderItemCompleted(item)).length;

  return [
    `${totalCount} item`,
    `${completedCount}/${totalCount} selesai`,
    getSupportingOrderWorkflowLabel(record.laboratory_workflow_status || 'draft'),
  ].filter(Boolean).join(' · ');
}

export function getRadiologyRecordItemCount(record?: MedicalRecord) {
  if (!record) return 0;
  return record.radiology_order_items?.length || 0;
}

export function getRadiologyRecordSummary(record?: MedicalRecord) {
  if (!record) return 'Belum ada item radiologi';

  const totalCount = record.radiology_order_items?.length || 0;
  if (totalCount === 0) return 'Belum ada item radiologi';

  return [
    `${totalCount} item`,
    getSupportingOrderWorkflowLabel(record.radiology_workflow_status || 'draft'),
  ].filter(Boolean).join(' · ');
}
