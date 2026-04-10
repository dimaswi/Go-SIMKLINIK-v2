import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const PAPER_INPUT_CLASSNAME =
  'h-7 rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-100 disabled:text-foreground';

export const PAPER_TEXTAREA_CLASSNAME =
  'min-h-0 rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5 shadow-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-100 disabled:text-foreground resize-none';

export const PAPER_SELECT_TRIGGER_CLASSNAME =
  'h-7 justify-between rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-100 disabled:text-foreground';

type NumberInputIndicator = {
  tone: 'normal' | 'warning' | 'danger';
  label: string;
};

type TableSectionProps = {
  title?: string;
  helper?: string;
  children: ReactNode;
  tableClassName?: string;
};

export function TableSection({ title, helper, children, tableClassName }: TableSectionProps) {
  const hasHeading = Boolean(title || helper);

  return (
    <section className={hasHeading ? 'space-y-1.5' : undefined}>
      {hasHeading && (
        <div className="px-0.5">
          {title ? <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3> : null}
          {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={cn('w-full table-fixed border-collapse border border-border/70 bg-background', tableClassName)}>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

type TableRowProps = {
  children: ReactNode;
};

export function TableRow({ children }: TableRowProps) {
  return <tr className="align-top">{children}</tr>;
}

type TableCellProps = {
  label: string;
  helper?: string;
  children: ReactNode;
  colSpan?: number;
  className?: string;
};

export function TableCell({ label, helper, children, colSpan = 1, className }: TableCellProps) {
  return (
    <td colSpan={colSpan} className={cn('align-top border-b border-r border-border/70 p-0', className)}>
      <div className="border-b border-border/60 px-2.5 py-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/85">{label}</Label>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </div>
      <div className="p-2.5">{children}</div>
    </td>
  );
}

type NumberInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  step?: number;
  min?: number;
  max?: number;
  hideLabel?: boolean;
  indicator?: NumberInputIndicator | null;
};

export function NumberInput({
  label,
  value,
  onChange,
  disabled,
  step,
  min,
  max,
  hideLabel = false,
  indicator,
}: NumberInputProps) {
  const indicatorToneClass = indicator ? {
    normal: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
  }[indicator.tone] : '';

  return (
    <div className="space-y-1">
      {!hideLabel && <Label className="text-xs font-medium">{label}</Label>}
      <Input
        type="number"
        value={value || ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        className={PAPER_INPUT_CLASSNAME}
      />
      {indicator && (
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex rounded-none border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', indicatorToneClass)}>
            {indicator.label}
          </span>
        </div>
      )}
    </div>
  );
}

type TextEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  rows?: number;
  placeholder?: string;
  hideLabel?: boolean;
};

export function TextEditor({
  label,
  value,
  onChange,
  disabled,
  rows = 5,
  placeholder,
  hideLabel = false,
}: TextEditorProps) {
  return (
    <div className="space-y-0.5">
      {!hideLabel && <Label className="text-xs font-medium">{label}</Label>}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(PAPER_TEXTAREA_CLASSNAME, rows >= 5 ? 'min-h-[92px]' : rows >= 3 ? 'min-h-[68px]' : 'min-h-[48px]')}
      />
    </div>
  );
}
