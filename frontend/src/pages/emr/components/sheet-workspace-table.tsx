import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight } from 'lucide-react';
import type { MedicalRecordSectionType, OdontogramEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { SURAT_TYPE_OPTIONS, VISIBLE_SHEET_CONFIGS, getInitialAssessmentEntryFilter, isInitialAssessmentSheetKey } from '../constants';
import { getOdontogramEntryStatus, getOdontogramEntrySummary } from '../odontogram';
import { buildSheetEntryGroups, collectVisitInformedConsents, getRecordsForSheetSections, getSheetStatus, getSheetSummary } from '../utils';
import { SectionStatusBadge } from './section-status-badge';
import type { SectionStatusTone } from '../types';

export type SheetTableRow = {
  key: string;
  label: string;
  description: string;
  icon: any;
  status: { label: string; tone: SectionStatusTone };
  relatedDataText: string;
  summaryText: string;
  link: string;
};

type SheetWorkspaceTableProps = {
  visitId: number;
  recordsBySection: Record<MedicalRecordSectionType, any[]>;
  visitLocked: boolean;
  odontogramEntries: OdontogramEntry[];
  search?: string;
};

export function SheetWorkspaceTable({
  visitId,
  recordsBySection,
  visitLocked,
  odontogramEntries,
  search = '',
}: SheetWorkspaceTableProps) {
  const rows = useMemo<SheetTableRow[]>(() => {
    return VISIBLE_SHEET_CONFIGS.map((sheet) => {
      const isOdontogramSheet = sheet.key === 'odontogram';
      const isSuratSheet = sheet.key === 'surat';
      const initialAssessmentFilter = isInitialAssessmentSheetKey(sheet.key)
        ? (getInitialAssessmentEntryFilter(sheet.key) || undefined)
        : undefined;
      const relatedRecords = getRecordsForSheetSections(
        recordsBySection as Record<MedicalRecordSectionType, any[]>,
        sheet.sections,
        initialAssessmentFilter
      );
      const status = isOdontogramSheet
        ? getOdontogramEntryStatus(odontogramEntries[0], visitLocked)
        : getSheetStatus(sheet, recordsBySection as Record<MedicalRecordSectionType, any[]>, visitLocked);
      const entryCount = isOdontogramSheet
        ? odontogramEntries.length
        : isInitialAssessmentSheetKey(sheet.key)
        ? buildSheetEntryGroups(recordsBySection as Record<MedicalRecordSectionType, any[]>, sheet.sections, initialAssessmentFilter).length
        : sheet.key === 'informed-consent'
        ? collectVisitInformedConsents(relatedRecords).length
        : relatedRecords.length;

      const relatedDataText = isSuratSheet
        ? `${entryCount} entri surat | ${SURAT_TYPE_OPTIONS.length} jenis`
        : sheet.sections.length > 0
        ? isInitialAssessmentSheetKey(sheet.key)
          ? `${entryCount} paket ${sheet.key === 'pengkajian-awal-gigi' ? 'pengkajian gigi' : 'pengkajian'}`
          : `${entryCount} entri terkait`
        : isOdontogramSheet
          ? `${entryCount} entri odontogram`
        : 'Belum memakai data klinis';

      const summaryText = isSuratSheet
        ? 'Pilih: Surat Sakit, Surat Sehat, Surat MCU, Surat Buta Warna, atau Surat Rujukan.'
        : isOdontogramSheet
          ? getOdontogramEntrySummary(odontogramEntries[0])
          : getSheetSummary(sheet, recordsBySection as Record<MedicalRecordSectionType, any[]>);

      return {
        key: sheet.key,
        label: sheet.label,
        description: sheet.description,
        icon: sheet.icon,
        status,
        relatedDataText,
        summaryText,
        link: `/emr/${visitId}/sheets/${sheet.key}`,
      };
    });
  }, [visitId, recordsBySection, visitLocked, odontogramEntries]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.relatedDataText.toLowerCase().includes(q) ||
        r.summaryText.toLowerCase().includes(q) ||
        r.status.label.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns: ColumnDef<SheetTableRow>[] = useMemo(
    () => [
      {
        accessorKey: 'label',
        header: 'Lembar Dokumen',
        cell: ({ row }) => {
          const item = row.original;
          const Icon = item.icon;
          return (
            <div className="flex items-start gap-3 py-1">
              <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted/20 shrink-0 mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-xs sm:text-sm text-foreground">{item.label}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">{item.description}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          return <SectionStatusBadge label={status.label} tone={status.tone} />;
        },
      },
      {
        accessorKey: 'relatedDataText',
        header: 'Data Terkait',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">{row.original.relatedDataText}</span>
        ),
      },
      {
        accessorKey: 'summaryText',
        header: 'Ringkasan',
        cell: ({ row }) => (
          <p className="max-w-md line-clamp-2 text-xs text-muted-foreground">
            {row.original.summaryText}
          </p>
        ),
      },
      {
        id: 'actions',
        header: 'Aksi',
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" title={`Buka ${row.original.label}`}>
            <Link to={row.original.link}>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="p-0">
      <DataTable
        columns={columns}
        data={filteredRows}
        showSearch={false}
        showColumnVisibility={false}
        showSelectionSummary={false}
        showPagination={false}
        emptyMessage="Tidak ada lembar dokumen yang sesuai dengan pencarian."
      />
    </div>
  );
}