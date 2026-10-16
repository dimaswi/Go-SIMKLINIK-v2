import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { queueApi, registrationQueueApi, visitsApi, type Polyclinic, type RegistrationQueueItem, type Visit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowUpRight,
  Clock3,
  FileText,
  Loader2,
  Monitor,
  Printer,
  RefreshCw,
  Siren,
  Ticket,
  Trash2,
  Users,
} from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { openPdfDocumentInNewWindow } from '../emr/print-document';

type QueueBuckets = {
  waiting: Visit[];
  in_consultation: Visit[];
  done: Visit[];
  cancelled: Visit[];
};

const EMPTY_QUEUE: QueueBuckets = {
  waiting: [],
  in_consultation: [],
  done: [],
  cancelled: [],
};

const REGISTRATION_STATUS_LABEL: Record<string, string> = {
  waiting: 'Menunggu',
  called: 'Dipanggil',
  processing: 'Diproses',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const PAYMENT_LABEL: Record<string, string> = {
  umum: 'Umum',
  bpjs: 'BPJS',
  asuransi: 'Asuransi',
};

function formatShortTime(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}


function QueueTicket({
  visit,
  actions,
}: {
  visit: Visit;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`border px-4 py-4 ${visit.priority === 'urgent' ? 'border-orange-300 bg-orange-50/60' : 'border-border/70 bg-background'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-3xl font-black leading-none ${visit.priority === 'urgent' ? 'text-orange-600' : 'text-foreground'}`}>
            {String(visit.queue_number).padStart(3, '0')}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{visit.patient?.full_name || '-'}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{visit.patient?.medical_record_number || '-'}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline" className="rounded-none shadow-none">
            {PAYMENT_LABEL[visit.payment_type] || visit.payment_type}
          </Badge>
          {visit.priority === 'urgent' ? (
            <Badge variant="outline" className="rounded-none border-orange-300 bg-orange-100 text-orange-700 shadow-none">
              Urgent
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>Poli: {visit.polyclinic?.name || '-'}</p>
        <p>Dokter: {visit.doctor?.full_name || 'Belum dipilih'}</p>
        <p>Keluhan: {visit.complaint || '-'}</p>
      </div>

      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function Lane({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden border border-border/70 bg-background">
      <div className="border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <span className="inline-flex h-6 min-w-6 items-center justify-center border border-border/70 bg-muted/40 px-2 text-xs font-semibold text-foreground">
            {count}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}

function RegistrationTicketRow({
  item,
  onPrint,
  onDelete,
  printing,
  deleting,
}: {
  item: RegistrationQueueItem;
  onPrint: (item: RegistrationQueueItem) => Promise<void>;
  onDelete?: (item: RegistrationQueueItem) => void;
  printing: boolean;
  deleting: boolean;
}) {
  const isActive = item.status === 'called' || item.status === 'processing';

  return (
    <div className={`border px-3 py-3 ${isActive ? 'border-primary/30 bg-primary/5' : 'border-border/70 bg-background'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black leading-none text-foreground">{String(item.ticket_number).padStart(3, '0')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Diambil {formatShortTime(item.created_at)}</p>
        </div>
        <div className="flex min-w-[118px] flex-col items-end gap-2">
          <Badge variant="outline" className="rounded-none shadow-none">
            {REGISTRATION_STATUS_LABEL[item.status] || item.status}
          </Badge>
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 rounded-none p-0 shadow-none"
              onClick={() => void onPrint(item)}
              disabled={printing || deleting}
              title="Cetak PDF"
              aria-label="Cetak PDF"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            </Button>
            {onDelete ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 rounded-none p-0 text-destructive shadow-none hover:text-destructive"
                onClick={() => onDelete(item)}
                disabled={printing || deleting}
                title="Hapus antrian"
                aria-label="Hapus antrian"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <p>Dipanggil: {formatShortTime(item.called_at)}</p>
        <p>Diproses: {formatShortTime(item.processing_started_at)}</p>
      </div>
    </div>
  );
}

function RegistrationLane({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[260px] flex-col overflow-hidden border border-border/70 bg-background">
      <div className="border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <span className="inline-flex h-6 min-w-6 items-center justify-center border border-border/70 bg-muted/40 px-2 text-xs font-semibold text-foreground">
            {count}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}

export default function QueueDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clockLabel, setClockLabel] = useState('');
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [polyclinicsLoaded, setPolyclinicsLoaded] = useState(false);
  const [selectedPoli, setSelectedPoli] = useState('');
  const [queueData, setQueueData] = useState<QueueBuckets>(EMPTY_QUEUE);
  const [registrationTickets, setRegistrationTickets] = useState<RegistrationQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [takingRegistrationTicket, setTakingRegistrationTicket] = useState(false);
  const [callingRegistrationTicket, setCallingRegistrationTicket] = useState(false);
  const [printingRegistrationTicketId, setPrintingRegistrationTicketId] = useState<number | null>(null);
  const [deletingRegistrationTicketId, setDeletingRegistrationTicketId] = useState<number | null>(null);
  const [registrationDeleteTarget, setRegistrationDeleteTarget] = useState<RegistrationQueueItem | null>(null);
  const [displayPickerOpen, setDisplayPickerOpen] = useState(false);
  const [displayTargetPoli, setDisplayTargetPoli] = useState('');
  const [activeTab, setActiveTab] = useState<'pendaftaran' | 'poli' | 'all'>('pendaftaran');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPageTitle('Front Office · Dashboard Antrian');
    queueApi.getPolyclinics().then((response) => {
      const list: Polyclinic[] = response.data.data || [];
      setPolyclinics(list);
      if (list.length > 0) {
        setSelectedPoli(String(list[0].id));
      }
      setPolyclinicsLoaded(true);
    }).catch(() => {
      setPolyclinicsLoaded(true);
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat opsi poliklinik untuk dashboard antrian.' });
    });
  }, [toast]);

  useEffect(() => {
    const updateClock = () => {
      setClockLabel(new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!selectedPoli) {
      return;
    }

    setLoading(true);
    try {
      const response = await queueApi.getByPolyclinic(Number(selectedPoli));
      setQueueData(response.data.data || EMPTY_QUEUE);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat dashboard antrian.' });
    } finally {
      setLoading(false);
    }
  }, [selectedPoli, toast]);

  const fetchRegistrationQueue = useCallback(async () => {
    try {
      const response = await registrationQueueApi.getAll(`date=${getLocalISODate()}`);
      setRegistrationTickets(response.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat antrian pendaftaran.' });
    }
  }, [toast]);

  useEffect(() => {
    void fetchQueue();
    void fetchRegistrationQueue();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      void fetchQueue();
      void fetchRegistrationQueue();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchQueue, fetchRegistrationQueue]);

  const callNext = async () => {
    if (!selectedPoli) {
      return;
    }

    setCallingNext(true);
    try {
      const response = await queueApi.callNext(Number(selectedPoli));
      const visit: Visit = response.data.data;
      toast({
        title: `Memanggil No. ${String(visit.queue_number).padStart(3, '0')}`,
        description: visit.patient?.full_name || 'Pasien berikutnya dipanggil.',
      });
      void fetchQueue();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal memanggil', description: error.response?.data?.error || 'Tidak ada pasien yang menunggu.' });
    } finally {
      setCallingNext(false);
    }
  };

  const updateStatus = async (visitId: number, update: { queue_status?: string; status?: string }) => {
    try {
      await visitsApi.updateStatus(visitId, update);
      void fetchQueue();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal!', description: error.response?.data?.error || 'Gagal update status.' });
    }
  };

  const printRegistrationTicket = useCallback(async (item: RegistrationQueueItem) => {
    if (printingRegistrationTicketId === item.id) {
      return;
    }

    setPrintingRegistrationTicketId(item.id);
    try {
      await openPdfDocumentInNewWindow({
        toast,
        loadingLabel: 'tiket antrian pendaftaran',
        preparingMessage: `Menyiapkan tiket antrian pendaftaran nomor ${String(item.ticket_number).padStart(3, '0')}...`,
        blockedDescription: 'Izinkan popup untuk membuka tiket antrian pendaftaran dari backend.',
        errorTitle: 'Gagal menyiapkan tiket antrian pendaftaran',
        errorFallback: 'PDF tiket antrian pendaftaran tidak dapat dibuat.',
        request: () => registrationQueueApi.print(item.id),
      });
    } finally {
      setPrintingRegistrationTicketId(null);
    }
  }, [printingRegistrationTicketId, toast]);

  const takeRegistrationTicket = async () => {
    setTakingRegistrationTicket(true);
    try {
      const response = await registrationQueueApi.create();
      const item = response.data.data;
      toast({
        variant: 'success',
        title: 'Tiket pendaftaran dibuat',
        description: `Nomor ${String(item.ticket_number).padStart(3, '0')} masuk ke antrian pendaftaran.`,
      });
      void fetchRegistrationQueue();
      await printRegistrationTicket(item);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal membuat tiket', description: error.response?.data?.error || 'Tiket pendaftaran tidak berhasil dibuat.' });
    } finally {
      setTakingRegistrationTicket(false);
    }
  };

  const callNextRegistrationTicket = async () => {
    setCallingRegistrationTicket(true);
    try {
      const response = await registrationQueueApi.callNext();
      const item = response.data.data;
      toast({
        title: `Panggil tiket ${String(item.ticket_number).padStart(3, '0')}`,
        description: 'Tiket ini siap diproses di halaman pendaftaran.',
      });
      void fetchRegistrationQueue();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Tidak ada antrian pendaftaran', description: error.response?.data?.error || 'Belum ada tiket pendaftaran yang menunggu.' });
    } finally {
      setCallingRegistrationTicket(false);
    }
  };

  const deleteRegistrationTicket = async () => {
    if (!registrationDeleteTarget) {
      return;
    }

    setDeletingRegistrationTicketId(registrationDeleteTarget.id);
    try {
      await registrationQueueApi.delete(registrationDeleteTarget.id);
      toast({
        variant: 'success',
        title: 'Antrian dihapus',
        description: `Tiket ${String(registrationDeleteTarget.ticket_number).padStart(3, '0')} berhasil dihapus dari antrian pendaftaran.`,
      });
      setRegistrationDeleteTarget(null);
      void fetchRegistrationQueue();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus antrian', description: error.response?.data?.error || 'Antrian pendaftaran tidak berhasil dihapus.' });
    } finally {
      setDeletingRegistrationTicketId(null);
    }
  };

  const waitingRegistrationTickets = useMemo(
    () => registrationTickets.filter((item) => item.status === 'waiting'),
    [registrationTickets]
  );
  const inServiceRegistrationTickets = useMemo(
    () => registrationTickets.filter((item) => item.status === 'called' || item.status === 'processing'),
    [registrationTickets]
  );

  const currentPolyclinic = polyclinics.find((item) => String(item.id) === selectedPoli) || null;
  const currentCall = queueData.in_consultation[0] || null;
  const nextWaiting = queueData.waiting[0] || null;
  const hasQueuePolyclinicAccess = polyclinics.length > 0;

  const displayAllPath = '/queue/display?poli=all';

  const openDisplayWindow = (targetPoli: string) => {
    const target = targetPoli || 'all';
    const path = target === 'all' ? displayAllPath : `/queue/display?poli=${target}`;
    window.open(path, '_blank', 'popup=yes,width=1600,height=900,noopener,noreferrer');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:h-[calc(100vh-var(--app-header-height))] lg:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-background">
        {/* Unified Compact Header */}
        <div className="border-b border-border/70 px-3 py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-1 border border-border/70 bg-muted/40 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'pendaftaran' ? 'default' : 'ghost'}
                className="h-7 rounded-none px-3 text-xs shadow-none"
                onClick={() => setActiveTab('pendaftaran')}
              >
                Antrian Pendaftaran ({waitingRegistrationTickets.length + inServiceRegistrationTickets.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'poli' ? 'default' : 'ghost'}
                className="h-7 rounded-none px-3 text-xs shadow-none"
                onClick={() => setActiveTab('poli')}
              >
                Antrian Poli ({queueData.waiting.length + queueData.in_consultation.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'all' ? 'default' : 'ghost'}
                className="h-7 rounded-none px-3 text-xs shadow-none"
                onClick={() => setActiveTab('all')}
              >
                Semua Antrian
              </Button>
            </div>

            {/* Actions / Filters on the EXACT SAME LINE */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {clockLabel || '--:--:--'}
              </div>

              {(activeTab === 'poli' || activeTab === 'all') && (
                <div className="w-[200px]">
                  <SearchableSelect
                    options={polyclinics.map((polyclinic) => ({ value: String(polyclinic.id), label: polyclinic.name }))}
                    value={selectedPoli}
                    onValueChange={setSelectedPoli}
                    placeholder="Pilih poliklinik..."
                    searchPlaceholder="Cari poli..."
                    square
                  />
                </div>
              )}

              {(activeTab === 'poli' || activeTab === 'all') && (
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-none shadow-none" onClick={() => void fetchQueue()} disabled={loading}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Muat Ulang
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none shadow-none"
                onClick={() => {
                  const defaultPoli = selectedPoli || (polyclinics[0] ? String(polyclinics[0].id) : 'all');
                  setDisplayTargetPoli(defaultPoli);
                  setDisplayPickerOpen(true);
                }}
              >
                <Monitor className="mr-1.5 h-3.5 w-3.5" />
                Display Antrian
              </Button>

              {(activeTab === 'pendaftaran' || activeTab === 'all') && (
                <Button type="button" size="sm" className="h-8 rounded-none shadow-none" onClick={() => void takeRegistrationTicket()} disabled={takingRegistrationTicket}>
                  {takingRegistrationTicket ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ticket className="mr-1.5 h-3.5 w-3.5" />}
                  Ambil Antrian
                </Button>
              )}

              {(activeTab === 'pendaftaran' || activeTab === 'all') && (
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-none shadow-none" onClick={() => void callNextRegistrationTicket()} disabled={callingRegistrationTicket}>
                  {callingRegistrationTicket ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1.5 h-3.5 w-3.5" />}
                  Panggil Berikutnya
                </Button>
              )}

              {(activeTab === 'poli' || activeTab === 'all') && (
                <Button type="button" size="sm" className="h-8 rounded-none shadow-none" onClick={() => void callNext()} disabled={callingNext || !selectedPoli}>
                  {callingNext ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1.5 h-3.5 w-3.5" />}
                  Panggil Berikutnya
                </Button>
              )}

              {(activeTab === 'pendaftaran' || activeTab === 'all') && (
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-none shadow-none" onClick={() => navigate('/registration')}>
                  Buka Pendaftaran
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {(activeTab === 'pendaftaran' || activeTab === 'all') && (
            <div className={`grid min-h-0 gap-3 p-3 lg:grid-cols-2 ${activeTab === 'pendaftaran' ? 'flex-1' : ''}`}>
              <RegistrationLane title="Menunggu Dipanggil" count={waitingRegistrationTickets.length}>
                {waitingRegistrationTickets.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Belum ada tiket yang menunggu dipanggil.</p>
                ) : waitingRegistrationTickets.map((item) => (
                  <RegistrationTicketRow
                    key={item.id}
                    item={item}
                    onPrint={printRegistrationTicket}
                    onDelete={setRegistrationDeleteTarget}
                    printing={printingRegistrationTicketId === item.id}
                    deleting={deletingRegistrationTicketId === item.id}
                  />
                ))}
              </RegistrationLane>

              <RegistrationLane title="Masuk Ke Pendaftaran" count={inServiceRegistrationTickets.length}>
                {inServiceRegistrationTickets.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Belum ada tiket yang sedang dipanggil atau diproses.</p>
                ) : inServiceRegistrationTickets.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <RegistrationTicketRow
                      item={item}
                      onPrint={printRegistrationTicket}
                      onDelete={setRegistrationDeleteTarget}
                      printing={printingRegistrationTicketId === item.id}
                      deleting={deletingRegistrationTicketId === item.id}
                    />
                    <Button type="button" variant="outline" className="w-full rounded-none shadow-none" onClick={() => navigate('/registration')}>
                      Proses Di Halaman Pendaftaran
                    </Button>
                  </div>
                ))}
              </RegistrationLane>
            </div>
          )}

          {(activeTab === 'poli' || activeTab === 'all') && (
            <div className={`flex min-h-0 flex-col overflow-hidden ${activeTab === 'poli' ? 'flex-1' : 'border-t border-border/70'}`}>
              {polyclinicsLoaded && !hasQueuePolyclinicAccess ? (
                <div className="border-b border-border/70 px-4 py-6">
                  <div className="border border-dashed border-border/70 bg-muted/10 px-5 py-6 text-center">
                    <p className="text-sm font-semibold text-foreground">Belum ada poliklinik yang bisa diakses untuk antrean.</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Jika Anda login sebagai dokter, tautkan profil dokter ke poliklinik atau jadwal aktif terlebih dahulu agar dashboard antrean bisa menampilkan lane poli yang relevan.
                    </p>
                  </div>
                </div>
              ) : null}

          {hasQueuePolyclinicAccess && (currentCall || nextWaiting) ? (
            <div className="grid gap-3 border-b border-border/70 px-4 py-3 lg:grid-cols-2">
              <div className="border border-border/70 bg-muted/20 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sedang Konsultasi</p>
                    <p className="mt-1 text-4xl font-black leading-none tracking-tight text-foreground">{currentCall ? String(currentCall.queue_number).padStart(3, '0') : '---'}</p>
                  </div>
                  {currentCall?.priority === 'urgent' ? (
                    <Badge variant="outline" className="rounded-none border-orange-300 bg-orange-100 text-orange-700 shadow-none">
                      <Siren className="mr-1 h-3.5 w-3.5" />
                      Urgent
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">{currentCall?.patient?.full_name || 'Belum ada pasien di ruang konsultasi'}</p>
                  <p>No. RM: {currentCall?.patient?.medical_record_number || '-'}</p>
                  <p>Poli: {currentCall?.polyclinic?.name || currentPolyclinic?.name || '-'}</p>
                  <p>Dokter: {currentCall?.doctor?.full_name || 'Belum ditentukan'}</p>
                </div>
              </div>

              <div className="border border-border/70 bg-muted/10 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Siap Dipanggil Berikutnya</p>
                <p className="mt-1 text-base font-semibold tracking-tight text-foreground">
                  {nextWaiting ? `${String(nextWaiting.queue_number).padStart(3, '0')} · ${nextWaiting.patient?.full_name || '-'}` : 'Belum ada pasien yang menunggu'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{nextWaiting ? `${nextWaiting.polyclinic?.name || '-'} · ${nextWaiting.doctor?.full_name || 'Dokter belum dipilih'}` : 'Pasien berikutnya akan muncul di sini.'}</p>
                {nextWaiting ? (
                  <Button type="button" variant="outline" className="mt-3 rounded-none shadow-none" onClick={() => navigate(`/emr/${nextWaiting.id}`)}>
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Buka EMR Pasien Berikutnya
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-4 py-4 lg:grid-cols-2 2xl:grid-cols-4">
            <Lane title="Menunggu" count={queueData.waiting.length}>
              {!hasQueuePolyclinicAccess ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada poli yang dapat ditampilkan pada akun ini.</p>
              ) : queueData.waiting.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pasien yang menunggu.</p>
              ) : queueData.waiting.map((visit) => (
                <QueueTicket key={visit.id} visit={visit} />
              ))}
            </Lane>

            <Lane title="Konsultasi" count={queueData.in_consultation.length}>
              {!hasQueuePolyclinicAccess ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada poli yang dapat ditampilkan pada akun ini.</p>
              ) : queueData.in_consultation.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pasien di ruang konsultasi.</p>
              ) : queueData.in_consultation.map((visit) => (
                <QueueTicket
                  key={visit.id}
                  visit={visit}
                  actions={
                    <>
                      <Button type="button" size="sm" className="rounded-none shadow-none" onClick={() => navigate(`/emr/${visit.id}`)}>
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Buka EMR
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-none shadow-none"
                        onClick={() => void updateStatus(visit.id, { queue_status: 'done', status: 'completed' })}
                      >
                        Selesaikan
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-none text-destructive shadow-none hover:text-destructive"
                        onClick={() => void updateStatus(visit.id, { queue_status: 'cancelled', status: 'cancelled' })}
                      >
                        Batalkan
                      </Button>
                    </>
                  }
                />
              ))}
            </Lane>

            <Lane title="Selesai" count={queueData.done.length}>
              {!hasQueuePolyclinicAccess ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada poli yang dapat ditampilkan pada akun ini.</p>
              ) : queueData.done.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada antrian yang selesai.</p>
              ) : queueData.done.map((visit) => (
                <QueueTicket key={visit.id} visit={visit} />
              ))}
            </Lane>

            <Lane title="Dibatalkan" count={queueData.cancelled.length}>
              {!hasQueuePolyclinicAccess ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada poli yang dapat ditampilkan pada akun ini.</p>
              ) : queueData.cancelled.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada antrian yang dibatalkan.</p>
              ) : queueData.cancelled.map((visit) => (
                <QueueTicket key={visit.id} visit={visit} />
              ))}
            </Lane>
          </div>
        </div>
      )}
        </div>
      </div>

      <Dialog open={displayPickerOpen} onOpenChange={setDisplayPickerOpen}>
        <DialogContent className="max-w-xl rounded-none border-border/70">
          <DialogHeader>
            <DialogTitle className="text-base">Pilih Display Antrian</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih poli yang ingin ditampilkan, atau pilih Semua Poliklinik.
            </DialogDescription>
          </DialogHeader>

          <LabelledControl label="Poli Display">
            <SearchableSelect
              options={[
                { value: 'all', label: 'Semua Poliklinik' },
                ...polyclinics.map((polyclinic) => ({ value: String(polyclinic.id), label: polyclinic.name })),
              ]}
              value={displayTargetPoli}
              onValueChange={setDisplayTargetPoli}
              placeholder="Pilih poli display..."
              searchPlaceholder="Cari poli..."
              square
              disabled={!hasQueuePolyclinicAccess}
            />
          </LabelledControl>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => setDisplayPickerOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              className="rounded-none shadow-none"
              onClick={() => {
                openDisplayWindow(displayTargetPoli || 'all');
                setDisplayPickerOpen(false);
              }}
              disabled={!hasQueuePolyclinicAccess}
            >
              <Monitor className="mr-2 h-4 w-4" />
              Buka Display
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(registrationDeleteTarget)}
        onOpenChange={(open) => {
          if (!open && deletingRegistrationTicketId === null) {
            setRegistrationDeleteTarget(null);
          }
        }}
        onConfirm={() => {
          void deleteRegistrationTicket();
        }}
        title="Hapus antrian pendaftaran"
        description={registrationDeleteTarget
          ? `Tiket ${String(registrationDeleteTarget.ticket_number).padStart(3, '0')} akan dihapus dari antrian pendaftaran. Gunakan ini untuk membersihkan tiket sisa atau salah ambil.`
          : 'Tiket akan dihapus dari antrian pendaftaran.'}
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />

    </div>
  );
}

function LabelledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}