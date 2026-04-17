import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function MasterDataPageShell({
  title,
  subtitle,
  badges,
  meta,
  actions,
  aside,
  children,
  onBack,
}: {
  title: string;
  subtitle: string;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-3 py-3 sm:px-4 lg:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
              <h1 className="text-[15px] font-semibold tracking-tight lg:text-base">{title}</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
              {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{meta}</div> : null}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button variant="outline" type='button' className="w-full rounded-none shadow-none sm:w-auto" onClick={onBack}>Kembali</Button>
              {actions}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-3 py-3 sm:px-4 lg:px-5 lg:py-4">
        <div className={aside ? 'grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]' : ''}>
          {aside ? (
            <aside className="order-2 overflow-hidden border border-border/70 bg-background xl:order-1 xl:sticky xl:top-0 xl:self-start">
              {aside}
            </aside>
          ) : null}

          <div className="order-1 overflow-hidden border border-border/70 bg-background xl:order-2">
            <div className="min-w-0 bg-background">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MasterDataLegacySections({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-0 divide-y divide-border/70 [&_section]:!rounded-none [&_section]:!border-0 [&_section]:!bg-transparent [&_section]:!shadow-none [&_section]:!px-4 [&_section]:!py-4 lg:[&_section]:!px-5 lg:[&_section]:!py-5">
      {children}
    </div>
  );
}

export function MasterDataAsideStack({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/70 bg-background/60 [&>div]:!rounded-none [&>div]:!border-0 [&>div]:!shadow-none [&>div]:!px-4 [&>div]:!py-4 lg:[&>div]:!px-5 lg:[&>div]:!py-5">
      {children}
    </div>
  );
}

export function MasterDataAsideSection({ title, helper, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-sm">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {helper ? <p className="text-[11px] leading-5 text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function MasterDataSection({ title, helper, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4 lg:px-5 lg:py-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {helper ? <p className="text-[11px] leading-5 text-muted-foreground">{helper}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MasterDataDetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="text-sm leading-6 text-foreground/95">{value}</div>
    </div>
  );
}

export function formatMasterDataDateTime(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MasterDataListShell({
  title,
  subtitle,
  totalCount,
  badges,
  children,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-background">
      <div className="shrink-0 border-b border-border/70 px-3 py-3 sm:px-4 lg:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="text-[11px] leading-5 text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
              {totalCount} data
            </Badge>
            {badges}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3 sm:p-4 lg:p-5">
        {children}
      </div>
    </section>
  );
}