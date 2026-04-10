import type { LaboratoryOrderItem, MedicalRecord, RadiologyOrderItem } from '@/lib/api';
import { getLaboratoryOrderItemDetailPreview, getLaboratoryOrderItemResultPreview, isLaboratoryOrderItemCompleted } from '@/lib/laboratory';
import { getRadiologyOrderItemDetailPreview, getRadiologyOrderItemResultPreview, isRadiologyOrderItemCompleted } from '@/lib/radiology';

export type SupportingUnitType = 'laboratory' | 'radiology';

export type SupportingOrderLine = {
  key: string;
  name: string;
  detail: string;
  result: string;
};

function parseDateValue(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getSupportingWorkflowStatus(record: MedicalRecord, unitType: SupportingUnitType) {
  return unitType === 'laboratory'
    ? record.laboratory_workflow_status || 'draft'
    : record.radiology_workflow_status || 'draft';
}

export function getSupportingOrderedAt(record: MedicalRecord, unitType: SupportingUnitType) {
  return unitType === 'laboratory'
    ? record.laboratory_ordered_at || record.record_date
    : record.radiology_ordered_at || record.record_date;
}

export function getSupportingProcessedAt(record: MedicalRecord, unitType: SupportingUnitType) {
  return unitType === 'laboratory'
    ? record.laboratory_processed_at
    : record.radiology_processed_at;
}

export function isSupportingProcessAddedItem(
  record: MedicalRecord,
  unitType: SupportingUnitType,
  item: LaboratoryOrderItem | RadiologyOrderItem,
) {
  const orderedAt = parseDateValue(unitType === 'laboratory' ? record.laboratory_ordered_at : record.radiology_ordered_at);
  const createdAt = parseDateValue(item.created_at);
  return orderedAt !== null && createdAt !== null && createdAt > orderedAt;
}

export function hasSupportingSavedResults(record: MedicalRecord, unitType: SupportingUnitType) {
  if (unitType === 'laboratory') {
    return (record.laboratory_order_items || []).some((item) => {
      if (item.result_date || item.result_by || (item.result_value || '').trim() !== '') {
        return true;
      }

      return (item.parameter_results || []).some((parameter) => Boolean(parameter.result_date || parameter.result_by || (parameter.result_value || '').trim() !== ''));
    });
  }

  return (record.radiology_order_items || []).some((item) => {
    if (item.result_date || item.result_by || (item.findings || '').trim() !== '' || (item.impression || '').trim() !== '' || (item.recommendation || '').trim() !== '') {
      return true;
    }

    return (item.parameter_results || []).some((parameter) => Boolean(parameter.result_date || parameter.result_by || (parameter.result_value || '').trim() !== ''));
  });
}

export function getSupportingItemCount(record: MedicalRecord, unitType: SupportingUnitType) {
  return unitType === 'laboratory'
    ? record.laboratory_order_items?.length || 0
    : record.radiology_order_items?.length || 0;
}

export function getSupportingCompletedItemCount(record: MedicalRecord, unitType: SupportingUnitType) {
  if (unitType === 'laboratory') {
    return (record.laboratory_order_items || []).filter((item) => isLaboratoryOrderItemCompleted(item)).length;
  }

  return (record.radiology_order_items || []).filter((item) => isRadiologyOrderItemCompleted(item)).length;
}

export function getSupportingEstimatedValue(record: MedicalRecord, unitType: SupportingUnitType) {
  if (unitType === 'laboratory') {
    return (record.laboratory_order_items || []).reduce((total, item) => total + (item.medical_service?.price || item.lab_test?.price || 0), 0);
  }

  return (record.radiology_order_items || []).reduce((total, item) => total + (item.medical_service?.price || 0), 0);
}

export function buildSupportingOrderLines(record: MedicalRecord, unitType: SupportingUnitType): SupportingOrderLine[] {
  if (unitType === 'laboratory') {
    return (record.laboratory_order_items || []).map((item: LaboratoryOrderItem) => ({
      key: `lab-${item.id}`,
      name: item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || '-',
      detail: getLaboratoryOrderItemDetailPreview(item),
      result: getLaboratoryOrderItemResultPreview(item),
    }));
  }

  return (record.radiology_order_items || []).map((item: RadiologyOrderItem) => ({
    key: `rad-${item.id}`,
    name: item.service_name_snapshot || item.medical_service?.name || '-',
    detail: getRadiologyOrderItemDetailPreview(item),
    result: getRadiologyOrderItemResultPreview(item),
  }));
}

export function getSupportingPrimaryLine(record: MedicalRecord, unitType: SupportingUnitType) {
  return buildSupportingOrderLines(record, unitType)[0]?.name || '-';
}

export function filterSupportingOrders(
  orders: MedicalRecord[],
  search: string,
  polyclinicFilter: string,
  unitType: SupportingUnitType,
) {
  const normalizedSearch = search.trim().toLowerCase();

  return orders.filter((record) => {
    if (polyclinicFilter && String(record.polyclinic_id || record.polyclinic?.id || '') !== polyclinicFilter) {
      return false;
    }

    if (!normalizedSearch) return true;

    const haystacks = [
      record.patient?.full_name,
      record.patient?.medical_record_number,
      record.visit?.visit_number,
      record.doctor?.full_name,
      record.polyclinic?.name,
      record.notes,
      ...buildSupportingOrderLines(record, unitType).map((line) => `${line.name} ${line.detail} ${line.result}`),
    ]
      .map((value) => (value || '').toLowerCase())
      .filter(Boolean);

    return haystacks.some((value) => value.includes(normalizedSearch));
  });
}

export function getSupportingPolyclinicOptions(orders: MedicalRecord[]) {
  return Array.from(
    new Map(
      orders
        .filter((record) => record.polyclinic)
        .map((record) => [String(record.polyclinic?.id), {
          value: String(record.polyclinic?.id),
          label: record.polyclinic?.name || '-',
        }]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label));
}

export function formatSupportingCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}