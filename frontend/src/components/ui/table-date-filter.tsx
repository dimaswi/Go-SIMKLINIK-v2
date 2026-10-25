import { Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, getLocalISODate } from '@/lib/utils';

export interface TableDateFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  title?: string;
  disabled?: boolean;
}

export function TableDateFilter({
  value,
  onChange,
  className,
  inputClassName,
  title = 'Filter tanggal (Kosongkan untuk menampilkan semua tanggal)',
  disabled = false,
}: TableDateFilterProps) {
  const isFiltered = Boolean(value);

  return (
    <div className={cn('inline-flex items-center shrink-0', className)}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'h-9 w-36 border border-border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring shrink-0',
          !isFiltered && 'text-muted-foreground',
          inputClassName,
        )}
        title={title}
        aria-label="Filter tanggal"
      />
      {isFiltered ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange('')}
          disabled={disabled}
          className="h-9 px-2 rounded-none border-l-0 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0 shadow-none transition-colors"
          title="Hapus filter tanggal (Tampilkan semua data)"
        >
          <X className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Hapus</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(getLocalISODate())}
          disabled={disabled}
          className="h-9 px-2 rounded-none border-l-0 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0 shadow-none transition-colors"
          title="Terapkan filter hari ini"
        >
          <Calendar className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Hari Ini</span>
        </Button>
      )}
    </div>
  );
}
