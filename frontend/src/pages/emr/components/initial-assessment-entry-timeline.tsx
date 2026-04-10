import { CircleX, Loader2, Printer, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MedicalRecordSectionType } from '@/lib/api';
import { canCancelSheetEntryGroup, formatDateTimeCompact, getSheetEntryGroupStatus, getSheetEntryGroupSummary, isSheetEntryGroupCancelled, type MedicalSheetEntryGroup } from '../utils';

type InitialAssessmentEntryTimelineProps = {
  entries: MedicalSheetEntryGroup[];
  sections: MedicalRecordSectionType[];
  visitLocked: boolean;
  selectedEntryKey?: string | null;
  dirtyEntryKey?: string | null;
  printingEntryKey?: string | null;
  emptyStateLabel?: string;
  emptySummaryLabel?: string;
  onSelect: (entryKey: string) => void;
  onPrintEntry?: (entry: MedicalSheetEntryGroup) => void;
  onCancelEntry?: (entry: MedicalSheetEntryGroup) => void;
  onDeleteEntry?: (entry: MedicalSheetEntryGroup) => void;
};

function getEntryBadge(
  entry: MedicalSheetEntryGroup,
  sections: MedicalRecordSectionType[],
  visitLocked: boolean,
  dirtyEntryKey?: string | null
) {
  if (entry.key === dirtyEntryKey) {
    return {
      label: 'Belum simpan',
      className: 'border-amber-300 bg-amber-50 text-amber-700',
    };
  }

  const status = getSheetEntryGroupStatus(entry, sections, visitLocked);
  const className = {
    muted: 'border-border bg-muted text-muted-foreground',
    warning: 'border-amber-300 bg-amber-50 text-amber-700',
    info: 'border-sky-300 bg-sky-50 text-sky-700',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  }[status.tone];

  return {
    label: status.label,
    className,
  };
}

export function InitialAssessmentEntryTimeline({
  entries,
  sections,
  visitLocked,
  selectedEntryKey,
  dirtyEntryKey,
  printingEntryKey,
  emptyStateLabel,
  emptySummaryLabel,
  onSelect,
  onPrintEntry,
  onCancelEntry,
  onDeleteEntry,
}: InitialAssessmentEntryTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="h-full overflow-visible px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyStateLabel || 'Belum ada entri pengkajian awal.'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-visible bg-background">
      <div className="space-y-0 p-0">
        {entries.map((entry, index) => {
          const isActive = entry.key === selectedEntryKey;
          const isPrinting = entry.key === printingEntryKey;
          const summary = getSheetEntryGroupSummary(entry, sections, emptySummaryLabel || 'Pengkajian awal belum diisi');
          const badge = getEntryBadge(entry, sections, visitLocked, dirtyEntryKey);
          const latestRecord = Object.values(entry.records)
            .filter(Boolean)
            .sort((left, right) => new Date(right!.updated_at || right!.created_at || right!.record_date).getTime() - new Date(left!.updated_at || left!.created_at || left!.record_date).getTime())[0];

          return (
            <div
              key={entry.key}
              onClick={() => onSelect(entry.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(entry.key);
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
                <div className="w-8 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                  #{entries.length - index}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {formatDateTimeCompact(latestRecord?.updated_at || latestRecord?.created_at || latestRecord?.record_date)}
                    </span>
                    <Badge variant="outline" className={cn('h-4 rounded-none px-1.5 text-[9px] font-medium shadow-none', badge.className)}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-normal break-words text-[12px] leading-4 text-foreground/90">{summary}</p>
                </div>
                <div className="flex shrink-0 items-start justify-end gap-0.5 pt-0.5">
                  {onPrintEntry && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 rounded-none px-1.5 text-[10px] text-foreground/80 hover:bg-muted/40"
                      disabled={isPrinting}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPrintEntry(entry);
                      }}
                      aria-label={`Cetak entri ${entries.length - index}`}
                    >
                      {isPrinting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1 h-3.5 w-3.5" />}
                      Cetak
                    </Button>
                  )}
                  {onCancelEntry && !visitLocked && canCancelSheetEntryGroup(entry) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 rounded-none p-0 text-amber-700 hover:bg-transparent hover:text-amber-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEntry(entry);
                      }}
                      aria-label={`Batalkan entri ${entries.length - index}`}
                    >
                      <CircleX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDeleteEntry && !visitLocked && isSheetEntryGroupCancelled(entry) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 rounded-none p-0 text-destructive hover:bg-transparent hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteEntry(entry);
                      }}
                      aria-label={`Hapus entri ${entries.length - index}`}
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