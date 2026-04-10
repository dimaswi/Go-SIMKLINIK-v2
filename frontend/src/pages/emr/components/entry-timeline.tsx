import { CircleX, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MedicalRecord } from '@/lib/api';
import { canCancelMedicalRecord, formatDateTimeCompact, getSectionSummary, isMedicalRecordCancelled } from '../utils';

type EntryTimelineProps = {
  records: MedicalRecord[];
  selectedRecordId?: number | null;
  onSelect: (recordId: number) => void;
  onEditRecord?: (recordId: number) => void;
  onCancelRecord?: (record: MedicalRecord) => void;
  onDeleteRecord?: (record: MedicalRecord) => void;
  borderless?: boolean;
  dirtyRecordId?: number | null;
};

function getEntryStatus(record: MedicalRecord, dirtyRecordId?: number | null) {
  if (record.id === dirtyRecordId) {
    return {
      label: 'Belum simpan',
      className: 'border-amber-300 bg-amber-50 text-amber-700',
    };
  }

  if (record.status === 'final') {
    return {
      label: 'Final',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    };
  }

  if (isMedicalRecordCancelled(record)) {
    return {
      label: 'Batal',
      className: 'border-rose-300 bg-rose-50 text-rose-700',
    };
  }

  return {
    label: 'Tersimpan',
    className: 'border-sky-300 bg-sky-50 text-sky-700',
  };
}

export function EntryTimeline({
  records,
  selectedRecordId,
  onSelect,
  onEditRecord,
  onCancelRecord,
  onDeleteRecord,
  borderless = false,
  dirtyRecordId,
}: EntryTimelineProps) {
  if (records.length === 0) {
    return (
      <div className={borderless ? 'h-full overflow-visible px-4 py-8 text-center text-sm text-muted-foreground' : 'h-full overflow-visible border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground'}>
        Belum ada entri pada section ini.
      </div>
    );
  }

  return (
    <div className={borderless ? 'flex h-full flex-col overflow-visible bg-background' : 'flex h-full flex-col overflow-visible border border-border/70 bg-background'}>
      <div className="space-y-0 p-0">
        {records.map((record, index) => {
          const isActive = record.id === selectedRecordId;
          const summary = getSectionSummary(record) || 'Belum ada ringkasan.';
          const status = getEntryStatus(record, dirtyRecordId);

          return (
            <div
              key={record.id}
              onClick={() => onSelect(record.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(record.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={cn(
                'border-b border-border/60 px-2.5 py-2 text-left transition hover:bg-muted/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                isActive && 'bg-muted/20 [box-shadow:inset_2px_0_0_0_hsl(var(--foreground))]'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="w-8 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">#{records.length - index}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate">{formatDateTimeCompact(record.updated_at || record.created_at || record.record_date)}</span>
                    <Badge variant="outline" className={cn('h-4 rounded-none px-1.5 text-[9px] font-medium shadow-none', status.className)}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-normal break-words text-[12px] leading-4 text-foreground/90">{summary}</p>
                </div>
                <div className="flex shrink-0 items-start justify-end gap-0.5 pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 rounded-none p-0 text-sky-700 hover:bg-transparent hover:text-sky-800"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (onEditRecord) {
                        onEditRecord(record.id);
                        return;
                      }
                      onSelect(record.id);
                    }}
                    aria-label={`Edit entri ${records.length - index}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {onCancelRecord && canCancelMedicalRecord(record) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 rounded-none p-0 text-amber-700 hover:bg-transparent hover:text-amber-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelRecord(record);
                      }}
                      aria-label={`Batalkan entri ${records.length - index}`}
                    >
                      <CircleX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDeleteRecord && isMedicalRecordCancelled(record) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 rounded-none p-0 text-destructive hover:bg-transparent hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteRecord(record);
                      }}
                      aria-label={`Hapus entri ${records.length - index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
