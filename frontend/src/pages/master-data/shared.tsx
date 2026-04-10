import type { ReactNode } from 'react';
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
        <div className="px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
              <h1 className="text-[15px] font-semibold tracking-tight lg:text-base">{title}</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
              {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{meta}</div> : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" type='button' className="rounded-none shadow-none" onClick={onBack}>Kembali</Button>
              {actions}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-4 py-4 lg:px-5">
        <div className={aside ? 'grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]' : ''}>
          {aside ? (
            <aside className="overflow-hidden border border-border/70 bg-background xl:sticky xl:top-0 xl:self-start">
              {aside}
            </aside>
          ) : null}

          <div className="overflow-hidden border border-border/70 bg-background">
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