import { Badge } from '@/components/ui/badge';
import type { SectionStatusTone } from '../types';

type SectionStatusBadgeProps = {
  label: string;
  tone: SectionStatusTone;
};

export function SectionStatusBadge({ label, tone }: SectionStatusBadgeProps) {
  const className = {
    muted: 'border-border bg-muted text-muted-foreground',
    warning: 'border-amber-300 bg-amber-50 text-amber-700',
    info: 'border-sky-300 bg-sky-50 text-sky-700',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  }[tone];

  return (
    <Badge variant="outline" className={`${className} rounded-none shadow-none text-xs`}>
      {label}
    </Badge>
  );
}
