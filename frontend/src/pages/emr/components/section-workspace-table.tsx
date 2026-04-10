import { Link } from 'react-router-dom';
import type { MedicalRecord, MedicalRecordSectionType } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { SECTION_CONFIGS } from '../constants';
import { formatDateTime, getSectionRowStatus, getSectionSummary } from '../utils';
import { SectionStatusBadge } from './section-status-badge';

type SectionWorkspaceTableProps = {
  visitId: number;
  recordsBySection: Record<MedicalRecordSectionType, MedicalRecord[]>;
  visitLocked: boolean;
};

export function SectionWorkspaceTable({
  visitId,
  recordsBySection,
  visitLocked,
}: SectionWorkspaceTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/90 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Elemen</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Jumlah Entri</TableHead>
            <TableHead>Update Terakhir</TableHead>
            <TableHead>Ringkasan</TableHead>
            <TableHead className="w-[140px]">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SECTION_CONFIGS.map((section) => {
            const records = recordsBySection[section.key] || [];
            const latestRecord = records[0];
            const status = getSectionRowStatus(section.key, records, visitLocked);
            const Icon = section.icon;

            return (
              <TableRow key={section.key} className="transition-colors hover:bg-muted/20">
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-muted/50 p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{section.label}</p>
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <SectionStatusBadge label={status.label} tone={status.tone} />
                </TableCell>
                <TableCell>{records.length}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(latestRecord?.updated_at || latestRecord?.created_at || latestRecord?.record_date)}
                </TableCell>
                <TableCell>
                  <p className="max-w-md line-clamp-2 text-sm text-muted-foreground">{getSectionSummary(latestRecord)}</p>
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/emr/${visitId}/form/${section.key}`}>Buka</Link>
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
