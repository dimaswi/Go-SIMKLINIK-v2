import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Database, RefreshCcw, Sparkles, TriangleAlert } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SatusehatAutoSyncResourceResult, SatusehatVisitAutoSyncResult } from '@/lib/api';
import { cn } from '@/lib/utils';

type EncounterRequirement = {
  label: string;
  ready: boolean;
  value: string;
};

type SatusehatAutoSyncMonitorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitNumber: string;
  message?: string;
  result: SatusehatVisitAutoSyncResult | null;
  encounterRequirements: EncounterRequirement[];
  baselineReadyNodes?: string[];
  baselineResourceIds?: Record<string, string>;
};

type ResourceNode = {
  key: string;
  label: string;
  dependsOn: string[];
  note: string;
};

type NodeAggregate = {
  synced: number;
  failed: number;
  skipped: number;
  total: number;
  items: SatusehatAutoSyncResourceResult[];
};

type NodeStatusNotes = {
  failedMessages: string[];
  successMessages: string[];
};

type MonitorSummary = {
  total: number;
  synced: number;
  failed: number;
  skipped: number;
  existing: number;
  created: number;
  warningCount: number;
  completionPercent: number;
};

const RESOURCE_NODES: ResourceNode[] = [
  { key: 'organization', label: 'Organization', dependsOn: [], note: 'Master fasilitas untuk relasi pelayanan.' },
  { key: 'location', label: 'Location', dependsOn: ['organization'], note: 'Lokasi pelayanan yang terhubung ke Organization.' },
  { key: 'patient', label: 'Patient', dependsOn: [], note: 'Subjek utama semua resource klinis.' },
  { key: 'practitioner', label: 'Practitioner', dependsOn: ['organization'], note: 'Tenaga medis pelaksana pelayanan.' },
  { key: 'encounter', label: 'Encounter', dependsOn: ['patient', 'practitioner', 'organization', 'location'], note: 'Resource inti episode pelayanan rawat jalan.' },
  { key: 'observation', label: 'Vital Signs (Observation)', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Tanda vital pasien dari rekam medis.' },
  { key: 'condition', label: 'Diagnosis (Condition)', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Diagnosa klinis pada kunjungan.' },
  { key: 'clinical-impression', label: 'ClinicalImpression', dependsOn: ['encounter', 'patient', 'practitioner', 'condition'], note: 'Ringkasan penilaian klinis dokter.' },
  { key: 'laboratory-order-item', label: 'Laboratory Items', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'ServiceRequest/Specimen/Observation/DiagnosticReport laboratorium.' },
  { key: 'radiology-order-item', label: 'Radiology Items', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'ServiceRequest/Observation/DiagnosticReport radiologi.' },
  { key: 'procedure', label: 'Procedure', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Tindakan medis per kunjungan.' },
  { key: 'medicationrequest', label: 'MedicationRequest', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Permintaan obat dari resep.' },
  { key: 'medicationdispense', label: 'MedicationDispense', dependsOn: ['medicationrequest', 'patient', 'practitioner'], note: 'Penyerahan obat berdasarkan resep yang diproses.' },
  { key: 'careplan', label: 'CarePlan', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Rencana tata laksana pasien.' },
  { key: 'goal', label: 'Goal', dependsOn: ['careplan', 'patient'], note: 'Target klinis dari rencana perawatan.' },
  { key: 'allergyintolerance', label: 'AllergyIntolerance', dependsOn: ['patient'], note: 'Data alergi pasien untuk kesinambungan pelayanan.' },
  { key: 'composition', label: 'Composition', dependsOn: ['encounter', 'patient', 'practitioner'], note: 'Dokumen ringkasan medis kunjungan.' },
  { key: 'familymemberhistory', label: 'FamilyMemberHistory', dependsOn: ['patient'], note: 'Riwayat keluarga pasien yang relevan klinis.' },
];

const RESOURCE_FIELD_HINTS: Record<string, string[]> = {
  organization: ['Master Poli: pastikan SATUSEHAT Organization ID tersedia dan konfigurasi SATUSEHAT aktif.'],
  location: ['Master Poli: pastikan SATUSEHAT Location ID tersedia dan terkait dengan Organization.'],
  patient: ['Master Pasien: isi NIK 16 digit, nama lengkap, tanggal lahir, dan tempat lahir.', 'Jika data sudah ada di SATUSEHAT, isi field SATUSEHAT Patient ID pada master pasien.'],
  practitioner: ['Master Dokter: isi NIK 16 digit, nama dokter, dan spesialisasi.', 'Pastikan dokter terdaftar di Master Nakes SATUSEHAT.'],
  encounter: ['Data kunjungan: pastikan nomor kunjungan dan tanggal kunjungan valid.', 'Prasyarat Patient, Practitioner, Organization, dan Location harus ready.'],
  observation: ['Pemeriksaan Fisik: lengkapi data tanda vital (TD, nadi, suhu, respirasi, SpO2, BB/TB sesuai kondisi).'],
  condition: ['Assessment: isi diagnosis ICD-10 primer/sekunder pada kunjungan.'],
  'clinical-impression': ['Assessment: isi narasi penilaian klinis/assessment dokter.'],
  'laboratory-order-item': ['Lembar laboratorium: buat order laboratorium dan lengkapi item pemeriksaan.'],
  'radiology-order-item': ['Lembar radiologi: buat order radiologi dan lengkapi item pemeriksaan.'],
  procedure: ['Lembar tindakan: tambahkan tindakan medis/prosedur yang dilakukan.'],
  medicationrequest: ['Lembar resep: lengkapi obat, dosis, frekuensi, durasi, rute, dan jumlah.'],
  medicationdispense: ['Workflow farmasi internal: proses resep sampai tahap dispensing selesai.'],
  careplan: ['Assessment/Outcome: lengkapi rencana tatalaksana pasien (care plan).'],
  goal: ['Assessment/Outcome: lengkapi target klinis yang terkait care plan.'],
  allergyintolerance: ['Anamnesis atau master pasien: lengkapi data alergi pasien.'],
  composition: ['Outcome/Pemulangan: lengkapi ringkasan medis untuk dokumen Composition.'],
  familymemberhistory: ['Anamnesis: lengkapi riwayat keluarga yang relevan secara klinis.'],
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function resolveNodeKey(resourceType: string) {
  const token = normalize(resourceType).replace(/[\s_-]/g, '');

  switch (token) {
    case 'organization':
      return 'organization';
    case 'location':
      return 'location';
    case 'patient':
      return 'patient';
    case 'practitioner':
      return 'practitioner';
    case 'encounter':
      return 'encounter';
    case 'observation':
      return 'observation';
    case 'condition':
      return 'condition';
    case 'clinicalimpression':
      return 'clinical-impression';
    case 'laboratoryorderitem':
      return 'laboratory-order-item';
    case 'radiologyorderitem':
      return 'radiology-order-item';
    case 'procedure':
      return 'procedure';
    case 'medicationrequest':
      return 'medicationrequest';
    case 'medicationdispense':
      return 'medicationdispense';
    case 'careplan':
      return 'careplan';
    case 'goal':
      return 'goal';
    case 'allergyintolerance':
      return 'allergyintolerance';
    case 'composition':
      return 'composition';
    case 'familymemberhistory':
      return 'familymemberhistory';
    default:
      return token;
  }
}

function isResourceFailed(item: SatusehatAutoSyncResourceResult) {
  return normalize(item.status || '') === 'failed';
}

function isResourceReady(item: SatusehatAutoSyncResourceResult) {
  if (normalize(item.status || '') === 'synced') {
    return true;
  }
  if ((item.resource_id || '').trim()) {
    return true;
  }
  return (item.existing_resource_id || '').trim() !== '';
}

function isResourceSuccess(item: SatusehatAutoSyncResourceResult) {
  return !isResourceFailed(item) && isResourceReady(item);
}

function isResourceExisting(item: SatusehatAutoSyncResourceResult) {
  return !isResourceFailed(item) && !(item.resource_id || '').trim() && (item.existing_resource_id || '').trim() !== '';
}

function isResourceCreated(item: SatusehatAutoSyncResourceResult) {
  return !isResourceFailed(item) && (item.resource_id || '').trim() !== '';
}

function buildAggregates(result: SatusehatVisitAutoSyncResult | null) {
  const map = new Map<string, NodeAggregate>();
  const items = getResourceItems(result);

  for (const item of items) {
    const key = resolveNodeKey(item.resource_type || '');
    if (!map.has(key)) {
      map.set(key, { synced: 0, failed: 0, skipped: 0, total: 0, items: [] });
    }

    const aggregate = map.get(key)!;
    aggregate.total += 1;
    aggregate.items.push(item);

    if (isResourceFailed(item)) {
      aggregate.failed += 1;
      continue;
    }
    if (isResourceSuccess(item)) {
      aggregate.synced += 1;
      continue;
    }
    aggregate.skipped += 1;
  }

  return map;
}

function getResourceItems(result: SatusehatVisitAutoSyncResult | null) {
  const directResources = result?.resources || [];
  if (directResources.length > 0) {
    return directResources;
  }

  return [...(result?.sent_resources || []), ...(result?.unsent_resources || [])];
}

function getNodeStatus(aggregate: NodeAggregate | undefined, nodeKey: string, readyNodes: Set<string>) {
  if (!aggregate || aggregate.total === 0) {
    if (readyNodes.has(nodeKey)) {
      return 'synced';
    }
    return 'pending';
  }
  if (aggregate.failed > 0) {
    return 'failed';
  }
  if (aggregate.synced === aggregate.total) {
    return 'synced';
  }
  if (aggregate.skipped === aggregate.total) {
    return 'skipped';
  }
  return 'partial';
}

function getNodeStatusClass(status: string) {
  if (status === 'synced') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }
  if (status === 'partial') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (status === 'skipped') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function getNodeStatusLabel(status: string) {
  if (status === 'synced') {
    return 'Synced';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  if (status === 'partial') {
    return 'Partial';
  }
  if (status === 'skipped') {
    return 'Skipped';
  }
  return 'Pending';
}

function getNodeStatusBadgeClass(status: string) {
  if (status === 'synced') {
    return 'border-emerald-300 bg-emerald-100 text-emerald-800';
  }
  if (status === 'failed') {
    return 'border-rose-300 bg-rose-100 text-rose-800';
  }
  if (status === 'partial') {
    return 'border-amber-300 bg-amber-100 text-amber-900';
  }
  if (status === 'skipped') {
    return 'border-slate-300 bg-slate-200 text-slate-800';
  }
  return 'border-rose-300 bg-rose-100 text-rose-800';
}

function getDependencyLabel(keys: string[]) {
  if (keys.length === 0) {
    return 'Tidak ada prasyarat wajib.';
  }

  const labels = keys
    .map((key) => RESOURCE_NODES.find((node) => node.key === key)?.label || key)
    .join(', ');

  return `Prasyarat: ${labels}`;
}

function getResourceFieldHints(item: SatusehatAutoSyncResourceResult) {
  const nodeKey = resolveNodeKey(item.resource_type || '');
  const hints = [...(RESOURCE_FIELD_HINTS[nodeKey] || [])];
  const status = normalize(item.status || '');
  const detailText = normalize(`${item.message || ''} ${(item.warnings || []).join(' ')}`);

  if (status === 'skipped' && detailText.includes('prasyarat')) {
    hints.unshift('Selesaikan resource prasyarat lebih dulu sesuai dependency node.');
  }

  if (detailText.includes('duplikat') || detailText.includes('duplicate') || detailText.includes('already exists')) {
    hints.unshift('Data terdeteksi duplikat: pastikan SATUSEHAT ID existing sudah terisi pada data master lokal.');
  }

  if (hints.length === 0) {
    hints.push('Periksa field wajib pada form resource terkait dan ulangi auto-sync setelah data lengkap.');
  }

  return hints.slice(0, 3);
}

function getNodeFieldHints(nodeKey: string) {
  return RESOURCE_FIELD_HINTS[nodeKey] || [];
}

function buildStatusBuckets(items: SatusehatAutoSyncResourceResult[]) {
  const sent = items.filter((item) => isResourceSuccess(item));

  const unsent = items.filter((item) => !isResourceSuccess(item));

  return { sent, unsent };
}

function buildMonitorSummary(items: SatusehatAutoSyncResourceResult[]): MonitorSummary {
  const total = items.length;
  const synced = items.filter((item) => isResourceSuccess(item)).length;
  const failed = items.filter((item) => isResourceFailed(item)).length;
  const skipped = items.filter((item) => !isResourceFailed(item) && !isResourceSuccess(item)).length;
  const existing = items.filter((item) => isResourceExisting(item)).length;
  const created = items.filter((item) => isResourceCreated(item)).length;
  const warningCount = items.reduce((totalWarnings, item) => totalWarnings + (item.warnings || []).length, 0);
  const completionPercent = total === 0 ? 0 : Math.round((synced / total) * 100);

  return { total, synced, failed, skipped, existing, created, warningCount, completionPercent };
}

function getMonitorTone(summary: MonitorSummary) {
  if (summary.total === 0) {
    return {
      panelClass: 'border-slate-200 bg-slate-50/80',
      badgeClass: 'border-slate-300 bg-slate-100 text-slate-900',
      progressClass: 'bg-slate-200',
      indicatorClass: 'text-slate-500',
      iconClass: 'border-slate-300 bg-white text-slate-700',
      label: 'Belum ada resource',
      helper: 'Auto-sync belum menghasilkan resource untuk diproses.',
    };
  }
  if (summary.failed > 0) {
    return {
      panelClass: 'border-rose-200 bg-rose-50/80',
      badgeClass: 'border-rose-300 bg-rose-100 text-rose-900',
      progressClass: 'bg-rose-100',
      indicatorClass: 'text-rose-600',
      iconClass: 'border-rose-300 bg-white text-rose-700',
      label: 'Perlu tindak lanjut',
      helper: 'Masih ada resource gagal atau belum siap dikirim ke SATUSEHAT.',
    };
  }
  if (summary.skipped > 0) {
    return {
      panelClass: 'border-amber-200 bg-amber-50/80',
      badgeClass: 'border-amber-300 bg-amber-100 text-amber-900',
      progressClass: 'bg-amber-100',
      indicatorClass: 'text-amber-500',
      iconClass: 'border-amber-300 bg-white text-amber-700',
      label: 'Sebagian terkirim',
      helper: 'Sebagian resource sudah masuk, sisanya masih menunggu prasyarat atau data tambahan.',
    };
  }
  return {
    panelClass: 'border-emerald-200 bg-emerald-50/80',
    badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    progressClass: 'bg-emerald-100',
    indicatorClass: 'text-emerald-600',
    iconClass: 'border-emerald-300 bg-white text-emerald-700',
    label: 'Semua resource terkirim',
    helper: 'Seluruh resource yang diproses sudah berhasil dibuat atau ditemukan di SATUSEHAT.',
  };
}

function formatExecutedAt(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResourceVisualStatus(item: SatusehatAutoSyncResourceResult) {
  if (isResourceFailed(item)) {
    return {
      label: 'Error',
      cardClass: 'border-rose-200 bg-rose-50/80',
      badgeClass: 'border-rose-300 bg-rose-100 text-rose-900',
    };
  }
  if (isResourceCreated(item)) {
    return {
      label: 'ID Baru',
      cardClass: 'border-emerald-200 bg-emerald-50/80',
      badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    };
  }
  if (isResourceExisting(item)) {
    return {
      label: 'Existing',
      cardClass: 'border-sky-200 bg-sky-50/80',
      badgeClass: 'border-sky-300 bg-sky-100 text-sky-900',
    };
  }
  return {
    label: 'Pending',
    cardClass: 'border-amber-200 bg-amber-50/80',
    badgeClass: 'border-amber-300 bg-amber-100 text-amber-900',
  };
}

function getStatusHighlightTitle(summary: MonitorSummary) {
  if (summary.failed > 0) return 'Fokus Tindakan';
  if (summary.skipped > 0) return 'Status Resource';
  if (summary.synced > 0) return 'Hasil Sinkronisasi';
  return 'Ringkasan Resource';
}

function buildNodeStatusNotes(aggregate: NodeAggregate | undefined): NodeStatusNotes {
  if (!aggregate || aggregate.items.length === 0) {
    return { failedMessages: [], successMessages: [] };
  }

  const failedMessages: string[] = [];
  const successMessages: string[] = [];
  const seenFailed = new Set<string>();
  const seenSuccess = new Set<string>();

  for (const item of aggregate.items) {
    const message = (item.message || '').trim();
    if (!message) {
      continue;
    }

    if (isResourceFailed(item) && !seenFailed.has(message)) {
      seenFailed.add(message);
      failedMessages.push(message);
      continue;
    }

    if (isResourceSuccess(item) && !seenSuccess.has(message)) {
      seenSuccess.add(message);
      successMessages.push(message);
    }
  }

  return {
    failedMessages: failedMessages.slice(0, 2),
    successMessages: successMessages.slice(0, 1),
  };
}

type NodeResourceID = {
  source: 'existing' | 'new';
  value: string;
};

function collectNodeResourceIDs(nodeKey: string, aggregate: NodeAggregate | undefined, baselineResourceIds: Record<string, string>) {
  const output: NodeResourceID[] = [];
  const seen = new Set<string>();

  const baselineID = (baselineResourceIds[nodeKey] || '').trim();
  if (baselineID) {
    const fingerprint = `existing:${baselineID}`;
    seen.add(fingerprint);
    output.push({ source: 'existing', value: baselineID });
  }

  if (!aggregate) {
    return output;
  }

  for (const item of aggregate.items) {
    const newID = (item.resource_id || '').trim();
    if (newID) {
      const fingerprint = `new:${newID}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        output.push({ source: 'new', value: newID });
      }
    }

    const existingID = (item.existing_resource_id || '').trim();
    if (existingID) {
      const fingerprint = `existing:${existingID}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        output.push({ source: 'existing', value: existingID });
      }
    }
  }

  return output;
}

export function SatusehatAutoSyncMonitorDialog({
  open,
  onOpenChange,
  visitNumber,
  message,
  result,
  encounterRequirements,
  baselineReadyNodes = [],
  baselineResourceIds = {},
}: SatusehatAutoSyncMonitorDialogProps) {
  const [showAllNodes, setShowAllNodes] = useState(false);
  const aggregates = buildAggregates(result);
  const resourceItems = getResourceItems(result);
  const buckets = buildStatusBuckets(resourceItems);
  const summary = buildMonitorSummary(resourceItems);
  const monitorTone = getMonitorTone(summary);
  const readyNodes = new Set(baselineReadyNodes.map((item) => normalize(item)));
  const nodeViews = RESOURCE_NODES.map((node, index) => {
    const aggregate = aggregates.get(node.key);
    const status = getNodeStatus(aggregate, node.key, readyNodes);
    const nodeResourceIds = collectNodeResourceIDs(node.key, aggregate, baselineResourceIds);
    const nodeNotes = buildNodeStatusNotes(aggregate);
    const nodeHints = getNodeFieldHints(node.key);
    return {
      node,
      order: index,
      aggregate,
      status,
      nodeResourceIds,
      nodeNotes,
      nodeHints,
    };
  });
  const problematicNodeViews = nodeViews.filter((item) => item.status !== 'synced');
  const displayedNodeViews = showAllNodes || problematicNodeViews.length === 0 ? nodeViews : problematicNodeViews;
  const successfulHighlights = buckets.sent.slice(0, 6);
  const issueHighlights = buckets.unsent.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[900px] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="text-lg font-semibold tracking-tight">Monitor Auto Sync SATUSEHAT · {visitNumber}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {message || 'Pantau urutan kirim resource berdasarkan dependency node dari master sampai resource klinis.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          <div className="space-y-6 px-6 py-5">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-border/70 bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trigger</p>
                <p className="mt-1 text-sm font-medium text-foreground">{result?.trigger || '-'}</p>
              </div>
              <div className="border border-border/70 bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mode</p>
                <p className="mt-1 text-sm font-medium text-foreground">{result?.mode || '-'}</p>
              </div>
              <div className="border border-border/70 bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dieksekusi</p>
                <p className="mt-1 text-sm font-medium text-foreground">{formatExecutedAt(result?.executed_at)}</p>
              </div>
              <div className="border border-border/70 bg-background px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Job Status</p>
                <p className="mt-1 text-sm font-medium text-foreground">{result?.job_status || (summary.failed > 0 ? 'partial-failed' : 'completed')}</p>
              </div>
            </section>

            <section className={cn('border px-4 py-4', monitorTone.panelClass)}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center border', monitorTone.iconClass)}>
                    {summary.failed > 0 ? <AlertTriangle className="h-5 w-5" /> : summary.skipped > 0 ? <Clock3 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold tracking-tight text-foreground">{monitorTone.label}</h3>
                      <Badge variant="outline" className={cn('rounded-none px-2 text-[10px] uppercase tracking-wide', monitorTone.badgeClass)}>
                        {summary.synced}/{summary.total || 0} selesai
                      </Badge>
                    </div>
                    <p className="text-[12px] leading-5 text-foreground/80">{monitorTone.helper}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:w-[480px] xl:grid-cols-4">
                  <div className="border border-white/70 bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sukses</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{summary.synced}</p>
                  </div>
                  <div className="border border-white/70 bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Error</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{summary.failed}</p>
                  </div>
                  <div className="border border-white/70 bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Existing</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{summary.existing}</p>
                  </div>
                  <div className="border border-white/70 bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">ID Baru</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{summary.created}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-foreground/80">
                    <span>Progress Sync</span>
                    <span>{summary.completionPercent}%</span>
                  </div>
                  <Progress value={summary.completionPercent} className={cn('h-2 rounded-none [&>div]:bg-current', monitorTone.progressClass, monitorTone.indicatorClass)} />
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="border border-border/70 bg-white px-2 py-0.5">Skipped: {summary.skipped}</span>
                    <span className="border border-border/70 bg-white px-2 py-0.5">Warnings: {summary.warningCount}</span>
                    <span className="border border-border/70 bg-white px-2 py-0.5">Terkirim: {result?.sent_count ?? summary.synced}</span>
                    <span className="border border-border/70 bg-white px-2 py-0.5">Belum terkirim: {result?.unsent_count ?? summary.failed + summary.skipped}</span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="border border-white/70 bg-white/70 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <RefreshCcw className="h-4 w-4 text-foreground/70" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status Eksekusi</p>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">{getStatusHighlightTitle(summary)}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{message || 'Urutan kirim resource dipetakan dari master ke resource klinis agar blocker cepat terlihat.'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 xl:grid-cols-2">
              <div className={cn('border px-4 py-3', issueHighlights.length > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-emerald-200 bg-emerald-50/80')}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className={cn('text-sm font-semibold tracking-tight', issueHighlights.length > 0 ? 'text-rose-900' : 'text-emerald-900')}>{issueHighlights.length > 0 ? 'Fokus Tindakan' : 'Tidak Ada Resource Bermasalah'}</h3>
                    <p className={cn('text-[11px] leading-5', issueHighlights.length > 0 ? 'text-rose-800/90' : 'text-emerald-800/90')}>
                      {issueHighlights.length > 0 ? 'Resource yang gagal, tertahan, atau masih butuh data tambahan.' : 'Semua resource yang diproses sudah berhasil dibuat atau ditemukan.'}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('rounded-none px-2 text-[10px] uppercase tracking-wide', issueHighlights.length > 0 ? 'border-rose-300 bg-rose-100 text-rose-900' : 'border-emerald-300 bg-emerald-100 text-emerald-900')}>
                    {issueHighlights.length}
                  </Badge>
                </div>

                {issueHighlights.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {issueHighlights.map((item, index) => {
                      const visual = getResourceVisualStatus(item);
                      return (
                        <div key={`unsent-${item.resource_type}-${item.medical_record_id || index}`} className={cn('border px-3 py-2.5', visual.cardClass)}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                                <p className="text-sm font-semibold text-foreground">{item.resource_type}</p>
                                {item.medical_record_id ? <span className="text-[11px] text-muted-foreground">RM {item.medical_record_id}</span> : null}
                              </div>
                              {item.message ? <p className="mt-1 text-[11px] leading-5 text-foreground/85">{item.message}</p> : null}
                            </div>
                            <Badge variant="outline" className={cn('rounded-none px-2 text-[10px] uppercase tracking-wide', visual.badgeClass)}>
                              {visual.label}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {getResourceFieldHints(item).map((hint) => (
                              <span key={`${item.resource_type}-${hint}`} className="border border-white/70 bg-white/70 px-2 py-0.5 text-[10px] leading-4 text-foreground/80">
                                {hint}
                              </span>
                            ))}
                          </div>
                          {(item.warnings || []).length > 0 ? (
                            <div className="mt-2 flex items-start gap-2 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-900">
                              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <div>{item.warnings?.slice(0, 2).join(' | ')}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {buckets.unsent.length > issueHighlights.length ? (
                      <p className="text-[11px] text-muted-foreground">+{buckets.unsent.length - issueHighlights.length} resource lain masih butuh perhatian.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-3 border border-emerald-200 bg-white/70 px-3 py-3 text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Semua resource sudah terkirim.</p>
                      <p className="mt-1 text-[11px] leading-5 text-emerald-800">Monitor sekarang menampilkan status sukses, resource existing, dan node flow tanpa menandainya sebagai error.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-emerald-900">Resource Berhasil / Existing</h3>
                    <p className="text-[11px] leading-5 text-emerald-800/90">Menampilkan resource yang berhasil dibuat atau sudah tersedia di SATUSEHAT.</p>
                  </div>
                  <Badge variant="outline" className="rounded-none border-emerald-300 bg-emerald-100 px-2 text-[10px] uppercase tracking-wide text-emerald-900">
                    {buckets.sent.length}
                  </Badge>
                </div>

                {successfulHighlights.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {successfulHighlights.map((item, index) => {
                      const visual = getResourceVisualStatus(item);
                      const primaryID = (item.resource_id || item.existing_resource_id || '').trim();
                      return (
                        <div key={`sent-${item.resource_type}-${item.medical_record_id || index}`} className={cn('border px-3 py-2.5', visual.cardClass)}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Database className="h-3.5 w-3.5 text-emerald-700" />
                                <p className="text-sm font-semibold text-foreground">{item.resource_type}</p>
                                {item.medical_record_id ? <span className="text-[11px] text-muted-foreground">RM {item.medical_record_id}</span> : null}
                              </div>
                              {item.message ? <p className="mt-1 text-[11px] leading-5 text-foreground/85">{item.message}</p> : null}
                            </div>
                            <Badge variant="outline" className={cn('rounded-none px-2 text-[10px] uppercase tracking-wide', visual.badgeClass)}>
                              {visual.label}
                            </Badge>
                          </div>
                          {primaryID ? (
                            <div className="mt-2 inline-flex border border-white/70 bg-white/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/80">
                              {visual.label}: {primaryID}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {buckets.sent.length > successfulHighlights.length ? (
                      <p className="text-[11px] text-muted-foreground">+{buckets.sent.length - successfulHighlights.length} resource sukses lain disembunyikan agar panel tetap ringkas.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-3 border border-slate-200 bg-white/70 px-3 py-3 text-slate-900">
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Belum ada resource sukses.</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">Periksa panel tindakan di sebelah kiri untuk melihat penyebab resource belum bisa dikirim.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Prasyarat Encounter</h3>
                <p className="text-[11px] leading-5 text-muted-foreground">Encounter wajib menunggu Patient, Practitioner, Organization, dan Location siap.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {encounterRequirements.map((item) => (
                  <div key={item.label} className="border border-border/70 bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                      <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-none px-1.5 text-[10px]">
                        {item.ready ? 'Ready' : 'Missing'}
                      </Badge>
                    </div>
                    <p className="mt-2 break-words text-sm text-foreground/95">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Node Flow Resource</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-none text-[10px] uppercase tracking-wide">
                    {displayedNodeViews.length}/{nodeViews.length} node
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-none px-2 text-[10px] uppercase tracking-wide"
                    onClick={() => setShowAllNodes((current) => !current)}
                  >
                    {showAllNodes ? 'Tampilkan Bermasalah' : 'Tampilkan Semua'}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">Mode default menampilkan node bermasalah agar cepat ditindak. Gunakan tombol untuk lihat semua node.</p>
              <div className="relative">
                {displayedNodeViews.map((view, index) => {
                  const { node, order, aggregate, status, nodeResourceIds, nodeNotes, nodeHints } = view;
                  const isRoot = order === 0;
                  const isLast = index === displayedNodeViews.length - 1;
                  return (
                    <div key={node.key} className="relative pb-3 pl-9 last:pb-0">
                      {!isLast ? <div className="absolute left-4 top-7 bottom-0 w-px bg-border/70" /> : null}
                      <div className="absolute left-3 top-5 h-2 w-2 rounded-full bg-foreground/60" />
                      <div className="absolute left-4 top-6 h-px w-4 bg-border/70" />

                      <div className={`border px-4 py-3 ${getNodeStatusClass(status)}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold tracking-tight">
                            {String(order + 1).padStart(2, '0')}. {node.label}
                          </p>
                          <div className="flex items-center gap-2">
                            {isRoot ? (
                              <Badge variant="outline" className="rounded-none border-amber-300 bg-amber-100 px-2 text-[10px] uppercase tracking-wide text-amber-900">
                                Akar
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className={`rounded-none px-2 text-[10px] uppercase tracking-wide ${getNodeStatusBadgeClass(status)}`}>
                            {getNodeStatusLabel(status)}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 opacity-90">{node.note}</p>
                        <p className="mt-1 text-[11px] leading-5 opacity-90">{getDependencyLabel(node.dependsOn)}</p>
                        <p className="mt-1 text-[11px] font-medium leading-5">
                          {aggregate
                            ? `${aggregate.synced} synced · ${aggregate.failed} failed · ${aggregate.skipped} skipped (${aggregate.total} item)`
                            : readyNodes.has(node.key)
                              ? 'Resource sudah tersedia (existing) pada kunjungan ini.'
                              : 'Belum ada item yang diproses untuk node ini.'}
                        </p>
                        {status !== 'synced' && nodeHints.length ? (
                          <p className="mt-1 text-[11px] leading-5 opacity-90">Lengkapi field: {nodeHints.join(' | ')}</p>
                        ) : null}
                        {nodeNotes.failedMessages.length ? (
                          <div className="mt-2 space-y-1">
                            {nodeNotes.failedMessages.map((errorMessage) => (
                              <div key={`${node.key}-error-${errorMessage}`} className="border border-rose-300 bg-rose-100 px-2 py-1 text-[11px] leading-5 text-rose-900">
                                Error: {errorMessage}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {!nodeNotes.failedMessages.length && nodeNotes.successMessages.length ? (
                          <div className="mt-2 border border-emerald-300 bg-emerald-100 px-2 py-1 text-[11px] leading-5 text-emerald-900">
                            Berhasil: {nodeNotes.successMessages[0]}
                          </div>
                        ) : null}
                        {nodeResourceIds.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {nodeResourceIds.map((item) => (
                              <span
                                key={`${node.key}-${item.source}-${item.value}`}
                                className={item.source === 'new'
                                  ? 'border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900'
                                  : 'border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-900'}
                              >
                                {item.source === 'new' ? 'ID Baru' : 'ID Existing'}: {item.value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {aggregate?.items.some((item) => (item.warnings || []).length > 0) ? (
                          <div className="mt-2 space-y-1">
                            {aggregate.items
                              .flatMap((item) => (item.warnings || []).slice(0, 1).map((warning) => ({ warning, resourceType: item.resource_type })))
                              .slice(0, 2)
                              .map((item) => (
                                <div key={`${node.key}-warning-${item.resourceType}-${item.warning}`} className="border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] leading-5 text-amber-900">
                                  Warning {item.resourceType}: {item.warning}
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {result?.error ? (
              <section className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {result.error}
              </section>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
