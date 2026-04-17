import { Link } from 'react-router-dom';
import type { MedicalRecordSectionType, OdontogramEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SURAT_TYPE_OPTIONS, VISIBLE_SHEET_CONFIGS, getInitialAssessmentEntryFilter, isInitialAssessmentSheetKey } from '../constants';
import { getOdontogramEntryStatus, getOdontogramEntrySummary } from '../odontogram';
import { buildSheetEntryGroups, collectVisitInformedConsents, getRecordsForSheetSections, getSheetStatus, getSheetSummary } from '../utils';
import { SectionStatusBadge } from './section-status-badge';

type SheetWorkspaceTableProps = {
  visitId: number;
  recordsBySection: Record<MedicalRecordSectionType, any[]>;
  visitLocked: boolean;
  odontogramEntries: OdontogramEntry[];
};

export function SheetWorkspaceTable({
  visitId,
  recordsBySection,
  visitLocked,
  odontogramEntries,
}: SheetWorkspaceTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/90 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lembar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data Terkait</TableHead>
            <TableHead>Ringkasan</TableHead>
            <TableHead className="w-[140px]">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {VISIBLE_SHEET_CONFIGS.map((sheet) => {
            const isOdontogramSheet = sheet.key === 'odontogram';
            const isSuratSheet = sheet.key === 'surat';
            const initialAssessmentFilter = isInitialAssessmentSheetKey(sheet.key)
              ? (getInitialAssessmentEntryFilter(sheet.key) || undefined)
              : undefined;
            const relatedRecords = getRecordsForSheetSections(recordsBySection as Record<MedicalRecordSectionType, any[]>, sheet.sections, initialAssessmentFilter);
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
            const Icon = sheet.icon;

            return (
              <TableRow key={sheet.key} className="transition-colors hover:bg-muted/20">
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-muted/50 p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{sheet.label}</p>
                      <p className="text-xs text-muted-foreground">{sheet.description}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <SectionStatusBadge label={status.label} tone={status.tone} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {isSuratSheet
                    ? `${entryCount} entri surat | ${SURAT_TYPE_OPTIONS.length} jenis tersedia`
                    : sheet.sections.length > 0
                    ? isInitialAssessmentSheetKey(sheet.key)
                      ? `${entryCount} paket ${sheet.key === 'pengkajian-awal-gigi' ? 'pengkajian gigi' : 'pengkajian'}`
                      : `${entryCount} entri terkait`
                    : isOdontogramSheet
                      ? `${entryCount} entri odontogram`
                    : 'Belum memakai data klinis'}
                </TableCell>
                <TableCell>
                  <p className="max-w-md line-clamp-2 text-sm text-muted-foreground">
                    {isSuratSheet
                      ? 'Pilih: Surat Sakit, Surat Sehat, Surat MCU, atau Surat Buta Warna.'
                      : isOdontogramSheet
                        ? getOdontogramEntrySummary(odontogramEntries[0])
                        : getSheetSummary(sheet, recordsBySection as Record<MedicalRecordSectionType, any[]>)}
                  </p>
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/emr/${visitId}/sheets/${sheet.key}`}>Buka</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}