import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, FilePenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function MasterDataPageShell({
  title,
  subtitle: _subtitle,
  badges,
  meta: _meta,
  actions,
  aside: _aside,
  children,
  onBack,
  icon,
  stickyFooter,
}: {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  onBack: () => void;
  icon?: ReactNode;
  stickyFooter?: boolean;
}) {
  const location = useLocation();
  const isCreateOrEditRoute = /\/(create|edit)(\/.*)?$/.test(location.pathname) || location.pathname.includes('/create') || location.pathname.includes('/edit');
  const isForm = stickyFooter ?? (isCreateOrEditRoute || /(tambah|edit|ubah|buat|create|registrasi|workspace)/i.test(title));

  useEffect(() => {
    if (!isForm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const submitBtn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
      if (e.key === 'Escape') {
        const hasOpenDialog = document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');
        if (!hasOpenDialog) {
          e.preventDefault();
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isForm, onBack]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className={isForm ? 'flex-1 p-3 pb-16 sm:p-4 sm:pb-20' : 'p-3 sm:p-4'}>
        <div className="border border-border/70 bg-card shadow-none">
          <div className="flex flex-col gap-2 p-3 sm:px-4 sm:py-2.5 border-b border-border/70 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                    onClick={onBack}
                    aria-label="Kembali"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Kembali</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
                {icon || <FilePenLine className="h-4 w-4 text-primary" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">{title}</h1>
                  {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
                </div>
              </div>
            </div>

            {!isForm && actions ? (
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {actions}
              </div>
            ) : null}
          </div>

          <div className="p-0">
            <div className="min-w-0 bg-card p-3 sm:p-4">
              {children}
            </div>
          </div>
        </div>
      </div>

      {isForm ? (
        <div className="sticky bottom-0 z-30 mt-auto border-t border-border/70 bg-card/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              type="button"
              size="sm"
              className="h-8 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={onBack}
            >
              Kembali
            </Button>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {actions}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HeaderActionButton({
  label,
  icon,
  onClick,
  disabled,
  variant = 'outline',
  className,
  type = 'button',
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'outline' | 'default' | 'destructive' | 'secondary' | 'ghost';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          type={type}
          className={cn('h-8 w-8 p-0 rounded-none shadow-none shrink-0', className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function MasterDataLegacySections({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 [&_section]:!rounded-none [&_section]:!border-0 [&_section]:!bg-transparent [&_section]:!shadow-none [&_section]:!p-0">
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

export function MasterDataAsideSection({ title, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-sm">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function MasterDataSection({ title, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4 lg:px-5 lg:py-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
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
  children,
}: {
  title?: string;
  subtitle?: string;
  totalCount?: number;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}