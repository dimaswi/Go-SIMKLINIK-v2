import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { ControlScheduleWhatsAppDialog } from '@/components/control-schedule-whatsapp-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { type ControlScheduleItem, visitsApi } from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromScheduleItem } from '@/lib/control-schedule-whatsapp';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

function buildControlRegistrationQuery(item: ControlScheduleItem) {
  const params = new URLSearchParams();
  params.set('source', 'control-schedule');
  params.set('mode', 'existing');
  params.set('patient_id', String(item.patient_id));
  params.set('visit_date', new Date().toISOString().slice(0, 10));
  params.set('complaint', `Kontrol sesuai surat kontrol kunjungan ${item.visit_number}.`);
  params.set('priority', item.schedule_status === 'overdue' || item.schedule_status === 'today' ? 'urgent' : 'normal');
  params.set('control_visit_number', item.visit_number || '');
  params.set('control_follow_up_at', item.follow_up_at || '');
  params.set('control_instruction', item.follow_up_instruction || '');

  if (item.payment_type === 'bpjs' || item.payment_type === 'asuransi' || item.payment_type === 'umum') {
    params.set('payment_type', item.payment_type);
  }
  if (item.insurance_number) {
    params.set('insurance_number', item.insurance_number);
  }
  if (item.polyclinic_id) {
    params.set('polyclinic_id', String(item.polyclinic_id));
  }
  if (item.doctor_id) {
    params.set('doctor_id', String(item.doctor_id));
  }

  return params.toString();
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getIndicatorText(item: ControlScheduleItem) {
  if (item.days_until_follow_up < 0) {
    return `Lewat ${Math.abs(item.days_until_follow_up)} hari`;
  }
  if (item.days_until_follow_up === 0) {
    return 'Hari ini';
  }
  return `H-${item.days_until_follow_up}`;
}

function getIndicatorClassName(item: ControlScheduleItem) {
  switch (item.schedule_status_tone) {
    case 'destructive':
      return 'border-rose-300 bg-rose-50 text-rose-700';
    case 'warning':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    default:
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="border border-border/70 bg-background px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function ControlSchedulesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<ControlScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<ControlScheduleItem | null>(null);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await visitsApi.getControlSchedules();
      setData(response.data.data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat jadwal kontrol',
        description: error.response?.data?.error || 'Data monitoring kontrol tidak dapat dimuat.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Front Office · Monitoring Jadwal Kontrol');
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => ({
    total: data.length,
    overdue: data.filter((item) => item.schedule_status === 'overdue').length,
    today: data.filter((item) => item.schedule_status === 'today').length,
    soon: data.filter((item) => item.schedule_status === 'soon').length,
  }), [data]);

  const columns = useMemo<ColumnDef<ControlScheduleItem>[]>(() => [
    {
      accessorKey: 'patient_name',
      header: 'Pasien',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{item.patient_name || '-'}</p>
            <p className="text-xs text-muted-foreground">RM {item.medical_record_number || '-'}</p>
            <p className="text-xs text-muted-foreground">WA {item.patient_phone || '-'}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'visit_number',
      header: 'Kunjungan',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{item.visit_number || '-'}</p>
            <p className="text-xs text-muted-foreground">{item.polyclinic_name || '-'}</p>
            <p className="text-xs text-muted-foreground">{item.doctor_name || '-'}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'follow_up_at',
      header: 'Jadwal Kontrol',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{formatDateTime(item.follow_up_at)}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{item.follow_up_instruction || 'Belum ada instruksi tambahan.'}</p>
          </div>
        );
      },
    },
    {
      id: 'indicator',
      header: 'Indikator',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={cn('rounded-none shadow-none', getIndicatorClassName(item))}>
              {item.schedule_status_label}
            </Badge>
            <p className="text-xs font-medium text-muted-foreground">{getIndicatorText(item)}</p>
          </div>
        );
      },
      meta: {
        headerClassName: 'w-[150px]',
        cellClassName: 'align-top',
      },
    },
    {
      id: 'actions',
      header: 'Aksi',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="grid min-w-[190px] gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-1.5 rounded-none"
              onClick={() => {
                setSelectedSchedule(item);
                setWhatsAppOpen(true);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              WA
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start rounded-none"
              onClick={() => navigate(`/registration/create?${buildControlRegistrationQuery(item)}`)}
            >
              Daftarkan Kontrol
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start rounded-none"
              onClick={() => navigate(item.emr_path)}
            >
              EMR
            </Button>
          </div>
        );
      },
      meta: {
        headerClassName: 'w-[220px]',
        cellClassName: 'align-top',
      },
    },
  ], [navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-visible p-3 md:h-[calc(100vh-var(--app-header-height))] md:flex-1 md:overflow-hidden lg:p-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Kontrol" value={String(stats.total)} helper="Semua jadwal kontrol yang tercatat dari visit final." />
        <StatCard label="Terlambat" value={String(stats.overdue)} helper="Pasien yang sudah melewati tanggal kontrol." />
        <StatCard label="Hari Ini" value={String(stats.today)} helper="Kontrol yang jatuh pada hari ini." />
        <StatCard label="Mendekati" value={String(stats.soon)} helper="Kontrol dalam tiga hari ke depan." />
      </section>

      <section className="border border-border/70 bg-background px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monitoring Jadwal Kontrol</p>
            <h1 className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">Semua jadwal kontrol ditampilkan tanpa filter untuk memudahkan follow up front office.</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <CalendarDays className="h-4 w-4" />
                Prioritaskan badge merah dan kuning untuk follow up WhatsApp.
              </div>
            </div>
            <Button type="button" variant="outline" className="h-9 rounded-none shadow-none" onClick={() => void loadData()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-background px-4 py-3">
        <DataTable
          columns={columns}
          data={data}
          searchPlaceholder="Cari pasien, no kunjungan, poli, dokter, atau nomor RM..."
          pageSize={10}
          showSelectionSummary={false}
          emptyMessage="Belum ada jadwal kontrol yang tercatat."
          className="min-h-0 flex-1"
        />
      </section>

      <ControlScheduleWhatsAppDialog
        open={whatsAppOpen}
        onOpenChange={setWhatsAppOpen}
        payload={selectedSchedule ? createControlScheduleWhatsAppPayloadFromScheduleItem(selectedSchedule) : null}
      />
    </div>
  );
}