import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { ControlScheduleWhatsAppDialog } from '@/components/control-schedule-whatsapp-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TableDateFilter } from '@/components/ui/table-date-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { type ControlScheduleItem, visitsApi } from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromScheduleItem } from '@/lib/control-schedule-whatsapp';
import { setPageTitle } from '@/lib/page-title';
import { cn, getLocalISODate } from '@/lib/utils';

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


  const columns = useMemo<ColumnDef<ControlScheduleItem>[]>(() => [
    {
      accessorKey: 'patient_name',
      header: 'Pasien',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{item.patient_name || '-'}</p>
            <p className="text-xs text-muted-foreground">
              RM {item.medical_record_number || '-'} · WA {item.patient_phone || '-'}
            </p>
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
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{item.visit_number || '-'}</p>
            <p className="text-xs text-muted-foreground">
              {item.polyclinic_name || '-'} · {item.doctor_name || '-'}
            </p>
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
          <div className="space-y-0.5 max-w-[340px]">
            <p className="font-medium text-foreground">{formatDateTime(item.follow_up_at)}</p>
            <p className="truncate text-xs text-muted-foreground">{item.follow_up_instruction || 'Belum ada instruksi tambahan.'}</p>
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
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn('rounded-none shadow-none text-xs', getIndicatorClassName(item))}>
              {item.schedule_status_label}
            </Badge>
            <p className="text-xs font-medium text-muted-foreground">{getIndicatorText(item)}</p>
          </div>
        );
      },
      meta: {
        headerClassName: 'w-[140px]',
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right pr-2">Aksi</div>,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs rounded-none shadow-none"
              onClick={() => {
                setSelectedSchedule(item);
                setWhatsAppOpen(true);
              }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WA
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs rounded-none shadow-none"
              onClick={() => navigate(`/registration/create?${buildControlRegistrationQuery(item)}`)}
            >
              Daftarkan Kontrol
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs rounded-none shadow-none"
              onClick={() => navigate(item.emr_path)}
            >
              EMR
            </Button>
          </div>
        );
      },
      meta: {
        headerClassName: 'w-[260px] text-right pr-4 whitespace-nowrap',
        cellClassName: 'text-right pr-4 whitespace-nowrap',
      },
    },
  ], [navigate]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(getLocalISODate());

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (statusFilter && item.schedule_status !== statusFilter) return false;
      if (dateFilter) {
        const itemDate = item.follow_up_at?.slice(0, 10);
        if (itemDate !== dateFilter) return false;
      }
      if (q) {
        const matchName = item.patient_name?.toLowerCase().includes(q);
        const matchRm = item.medical_record_number?.toLowerCase().includes(q);
        const matchVisit = item.visit_number?.toLowerCase().includes(q);
        const matchPoli = item.polyclinic_name?.toLowerCase().includes(q);
        const matchDoc = item.doctor_name?.toLowerCase().includes(q);
        if (!matchName && !matchRm && !matchVisit && !matchPoli && !matchDoc) return false;
      }
      return true;
    });
  }, [data, dateFilter, search, statusFilter]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Jadwal Kontrol
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / RM / poli..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <TableDateFilter
              value={dateFilter}
              onChange={setDateFilter}
              title="Filter tanggal kontrol (Kosongkan untuk menampilkan semua tanggal)"
            />

            <SearchableSelect
              options={[
                { value: 'today', label: 'Hari Ini' },
                { value: 'upcoming', label: 'Akan Datang' },
                { value: 'overdue', label: 'Terlewat' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Semua Status"
              noneLabel="Semua Status"
              className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={() => void loadData()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Segarkan
            </Button>
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Belum ada jadwal kontrol yang tercatat."
          />
        </div>
      </div>

      <ControlScheduleWhatsAppDialog
        open={whatsAppOpen}
        onOpenChange={setWhatsAppOpen}
        payload={selectedSchedule ? createControlScheduleWhatsAppPayloadFromScheduleItem(selectedSchedule) : null}
      />
    </div>
  );
}