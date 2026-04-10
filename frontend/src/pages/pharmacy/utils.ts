import type { MedicalRecord, Prescription, PrescriptionCompound, PrescriptionCompoundItem } from '@/lib/api';

export type PharmacyStatusFilter = 'all' | 'ordered' | 'preparing' | 'ready' | 'dispensed';
export type PharmacyWorkflowAction = 'prepare' | 'ready' | 'dispense';

export type PharmacyStockStatus = {
  available: boolean;
  label: string;
  helper: string;
  badgeClassName: string;
};

export type PharmacyOrderLine = {
  key: string;
  kind: 'non-racikan' | 'racikan';
  source_id?: number;
  name: string;
  quantityLabel: string;
  ruleLabel: string;
  price: number;
  notes: string;
  instructions: string;
  satusehatMedicationRequestId?: string;
};

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'ordered', label: 'Menunggu Penyiapan' },
  { value: 'preparing', label: 'Sedang Disiapkan' },
  { value: 'ready', label: 'Siap Diambil' },
  { value: 'dispensed', label: 'Sudah Diserahkan' },
];

export const WORKFLOW_BADGE_CLASSNAME: Record<string, string> = {
  ordered: 'border-amber-300 bg-amber-50 text-amber-700',
  preparing: 'border-sky-300 bg-sky-50 text-sky-700',
  ready: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  dispensed: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  draft: 'border-slate-300 bg-slate-50 text-slate-700',
  printed: 'border-slate-300 bg-slate-50 text-slate-700',
};

export const PHARMACY_ACTION_META: Record<PharmacyWorkflowAction, { label: string; processingLabel: string; successTitle: string }> = {
  prepare: {
    label: 'Mulai Siapkan',
    processingLabel: 'Menyiapkan...',
    successTitle: 'Order resep masuk proses penyiapan',
  },
  ready: {
    label: 'Tandai Siap Diambil',
    processingLabel: 'Menyimpan...',
    successTitle: 'Order resep siap diambil pasien',
  },
  dispense: {
    label: 'Serahkan Obat',
    processingLabel: 'Menyerahkan...',
    successTitle: 'Dispensing berhasil diproses',
  },
};

const STOCK_OK_BADGE_CLASSNAME = 'border-emerald-300 bg-emerald-50 text-emerald-700';
const STOCK_ISSUE_BADGE_CLASSNAME = 'border-rose-300 bg-rose-50 text-rose-700';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDateValue(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isPharmacyProcessAddedPrescription(record: MedicalRecord, item: Prescription) {
  const orderedAt = parseDateValue(record.prescription_ordered_at);
  const createdAt = parseDateValue(item.created_at);
  return orderedAt !== null && createdAt !== null && createdAt > orderedAt;
}

export function buildPrescriptionPrice(item: Prescription) {
  return (item.medicine?.selling_price || 0) * item.quantity;
}

export function buildCompoundPrice(item: PrescriptionCompound) {
  return (item.items || []).reduce((total, ingredient) => total + ((ingredient.medicine?.selling_price || 0) * ingredient.quantity), 0);
}

export function buildOrderLines(record: MedicalRecord): PharmacyOrderLine[] {
  const prescriptionLines: PharmacyOrderLine[] = (record.prescriptions || []).map((item) => ({
    key: `prescription-${item.id}`,
    kind: 'non-racikan',
    source_id: item.id,
    name: item.medicine?.name || '-',
    quantityLabel: `${item.quantity} ${item.medicine?.unit?.name || 'item'}`,
    ruleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
    price: buildPrescriptionPrice(item),
    notes: item.notes,
    instructions: item.instructions,
    satusehatMedicationRequestId: item.satusehat_medication_request_id,
  }));

  const compoundLines: PharmacyOrderLine[] = (record.prescription_compounds || []).map((item) => ({
    key: `compound-${item.id}`,
    kind: 'racikan',
    name: item.name,
    quantityLabel: `${item.output_quantity} ${item.output_unit || 'hasil'}`,
    ruleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
    price: buildCompoundPrice(item),
    notes: item.notes,
    instructions: item.instructions,
  }));

  return [...prescriptionLines, ...compoundLines];
}

export function getRecordTotalPrice(record: MedicalRecord) {
  return buildOrderLines(record).reduce((total, item) => total + item.price, 0);
}

export function getPrescriptionStockStatus(item: Prescription): PharmacyStockStatus {
  const availableStock = item.medicine?.current_stock || 0;
  if (availableStock < item.quantity) {
    return {
      available: false,
      label: 'Stok kurang',
      helper: `Tersedia ${availableStock}, butuh ${item.quantity}`,
      badgeClassName: STOCK_ISSUE_BADGE_CLASSNAME,
    };
  }

  return {
    available: true,
    label: 'Stok aman',
    helper: `Tersedia ${availableStock}`,
    badgeClassName: STOCK_OK_BADGE_CLASSNAME,
  };
}

export function getCompoundIngredientStockStatus(item: PrescriptionCompoundItem): PharmacyStockStatus {
  const availableStock = item.medicine?.current_stock || 0;
  if (availableStock < item.quantity) {
    return {
      available: false,
      label: 'Bahan kurang',
      helper: `Tersedia ${availableStock}, butuh ${item.quantity}`,
      badgeClassName: STOCK_ISSUE_BADGE_CLASSNAME,
    };
  }

  return {
    available: true,
    label: 'Bahan aman',
    helper: `Tersedia ${availableStock}`,
    badgeClassName: STOCK_OK_BADGE_CLASSNAME,
  };
}

export function getCompoundStockStatus(item: PrescriptionCompound): PharmacyStockStatus {
  const ingredientIssues = (item.items || []).filter((ingredient) => !getCompoundIngredientStockStatus(ingredient).available);

  if (ingredientIssues.length > 0) {
    return {
      available: false,
      label: `${ingredientIssues.length} bahan kurang`,
      helper: ingredientIssues.map((ingredient) => ingredient.medicine?.name || 'Bahan').slice(0, 2).join(', '),
      badgeClassName: STOCK_ISSUE_BADGE_CLASSNAME,
    };
  }

  return {
    available: true,
    label: 'Racikan aman',
    helper: `${(item.items || []).length} bahan tersedia`,
    badgeClassName: STOCK_OK_BADGE_CLASSNAME,
  };
}

export function getRecordStockIssueCount(record: MedicalRecord) {
  const prescriptionIssues = (record.prescriptions || []).filter((item) => !getPrescriptionStockStatus(item).available).length;
  const compoundIssues = (record.prescription_compounds || []).filter((item) => !getCompoundStockStatus(item).available).length;
  return prescriptionIssues + compoundIssues;
}

export function getRecordStockSummary(record: MedicalRecord): PharmacyStockStatus {
  const issueCount = getRecordStockIssueCount(record);
  if (issueCount > 0) {
    return {
      available: false,
      label: `${issueCount} item bermasalah`,
      helper: 'Periksa stok sebelum resep diproses lebih lanjut',
      badgeClassName: STOCK_ISSUE_BADGE_CLASSNAME,
    };
  }

  return {
    available: true,
    label: 'Semua stok aman',
    helper: 'Seluruh item resep tersedia saat ini',
    badgeClassName: STOCK_OK_BADGE_CLASSNAME,
  };
}

export function getPolyclinicOptions(records: MedicalRecord[]) {
  const seen = new Map<string, string>();
  records.forEach((record) => {
    if (record.polyclinic?.id && record.polyclinic.name) {
      seen.set(String(record.polyclinic.id), record.polyclinic.name);
    }
  });

  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'id-ID'));
}

export function filterPharmacyOrders(records: MedicalRecord[], search: string, polyclinicFilter: string) {
  const loweredSearch = search.trim().toLowerCase();

  return records.filter((record) => {
    if (polyclinicFilter && String(record.polyclinic_id) !== polyclinicFilter) {
      return false;
    }

    if (!loweredSearch) {
      return true;
    }

    const haystack = [
      record.patient?.full_name,
      record.patient?.medical_record_number,
      record.visit?.visit_number,
      record.doctor?.full_name,
      record.polyclinic?.name,
      ...(record.prescriptions || []).map((item) => item.medicine?.name || ''),
      ...(record.prescription_compounds || []).map((item) => item.name || ''),
    ].join(' ').toLowerCase();

    return haystack.includes(loweredSearch);
  });
}

export function getNextPharmacyAction(status?: string): PharmacyWorkflowAction | null {
  switch (status) {
    case 'ordered':
      return 'prepare';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'dispense';
    default:
      return null;
  }
}