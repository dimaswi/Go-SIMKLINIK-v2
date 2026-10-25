import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { doctorsApi, queueApi, registrationQueueApi, visitsApi, type Doctor, type Polyclinic, type RegistrationQueueItem, type Visit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowUpRight,
  Building2,
  Clock3,
  Edit,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Monitor,
  PhoneCall,
  Printer,
  RefreshCw,
  Siren,
  Stethoscope,
  Ticket,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { cn, generateDummyNik, getLocalISODate } from '@/lib/utils';
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



export default function QueueDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clockLabel, setClockLabel] = useState('');
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [polyclinicsLoaded, setPolyclinicsLoaded] = useState(false);
  const [selectedPoli, setSelectedPoli] = useState('');
  const [queueData, setQueueData] = useState<QueueBuckets>(EMPTY_QUEUE);
  const [registrationTickets, setRegistrationTickets] = useState<RegistrationQueueItem[]>([]);
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState<'all' | 'waiting' | 'in_service' | 'completed' | 'cancelled'>('all');
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [refreshingRegistration, setRefreshingRegistration] = useState(false);
  const [loading, setLoading] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [takingRegistrationTicket, setTakingRegistrationTicket] = useState(false);
  const [processingRegistrationTicketId, setProcessingRegistrationTicketId] = useState<number | null>(null);
  const [printingRegistrationTicketId, setPrintingRegistrationTicketId] = useState<number | null>(null);
  const [deletingRegistrationTicketId, setDeletingRegistrationTicketId] = useState<number | null>(null);
  const [registrationDeleteTarget, setRegistrationDeleteTarget] = useState<RegistrationQueueItem | null>(null);
  const [displayPickerOpen, setDisplayPickerOpen] = useState(false);
  const [displayTargetPoli, setDisplayTargetPoli] = useState('');
  const [activeTab, setActiveTab] = useState<'pendaftaran' | 'poli' | 'all'>('pendaftaran');
  const [takeTicketDialogOpen, setTakeTicketDialogOpen] = useState(false);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [ticketForm, setTicketForm] = useState({
    nik: '',
    patient_name: '',
    phone: '',
    polyclinic_id: '',
    doctor_id: '',
  });
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

    doctorsApi.getAll('is_active=true').then((res) => {
      setAllDoctors(res.data.data || []);
    }).catch(() => { });
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
    setRefreshingRegistration(true);
    try {
      const response = await registrationQueueApi.getAll(`date=${getLocalISODate()}`);
      setRegistrationTickets(response.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat antrian pendaftaran.' });
    } finally {
      setRefreshingRegistration(false);
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

  const takeRegistrationTicketWithData = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNik = ticketForm.nik.trim();
    const cleanName = ticketForm.patient_name.trim();
    const cleanPhone = ticketForm.phone.trim();

    if (!cleanNik || !cleanName || !cleanPhone) {
      toast({
        variant: 'destructive',
        title: 'Data belum lengkap',
        description: 'Mohon lengkapi NIK (16 digit), Nama Lengkap, dan Nomor HP/WA.',
      });
      return;
    }

    if (cleanNik.length !== 16 || !/^\d+$/.test(cleanNik)) {
      toast({
        variant: 'destructive',
        title: 'NIK tidak valid',
        description: 'NIK harus berupa 16 digit angka.',
      });
      return;
    }

    setTakingRegistrationTicket(true);
    try {
      const response = await registrationQueueApi.create({
        nik: cleanNik,
        patient_name: cleanName,
        phone: cleanPhone,
        polyclinic_id: ticketForm.polyclinic_id ? Number(ticketForm.polyclinic_id) : undefined,
        doctor_id: ticketForm.doctor_id ? Number(ticketForm.doctor_id) : undefined,
      });
      const item = response.data.data;
      setTakeTicketDialogOpen(false);
      setTicketForm({ nik: '', patient_name: '', phone: '', polyclinic_id: '', doctor_id: '' });
      toast({
        variant: 'success',
        title: `Tiket No. ${String(item.ticket_number).padStart(3, '0')} Berhasil Dibuat`,
        description: item.is_new_patient
          ? `Pasien Baru dibuat dengan No. RM: ${item.patient?.medical_record_number || '-'}`
          : `Pasien Lama: ${item.patient?.full_name || cleanName}`,
      });
      void fetchRegistrationQueue();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal membuat tiket',
        description: error.response?.data?.error || 'Tiket pendaftaran tidak berhasil dibuat.',
      });
    } finally {
      setTakingRegistrationTicket(false);
    }
  };

  const takeQuickRegistrationTicket = async () => {
    setTakingRegistrationTicket(true);
    try {
      const response = await registrationQueueApi.create();
      const item = response.data.data;
      setTakeTicketDialogOpen(false);
      toast({
        variant: 'success',
        title: 'Tiket pendaftaran dibuat',
        description: `Nomor ${String(item.ticket_number).padStart(3, '0')} masuk ke antrian pendaftaran.`,
      });
      void fetchRegistrationQueue();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal membuat tiket', description: error.response?.data?.error || 'Tiket pendaftaran tidak berhasil dibuat.' });
    } finally {
      setTakingRegistrationTicket(false);
    }
  };

  const handleProcessRegistrationTicket = async (item: RegistrationQueueItem) => {
    setProcessingRegistrationTicketId(item.id);
    try {
      const targetStatus = item.status === 'processing' ? 'processing' : (item.status === 'completed' ? 'completed' : 'called');
      const payload: { status: 'waiting' | 'cancelled' | 'completed' | 'called' | 'processing'; visit_id?: number } = { status: targetStatus };
      if (item.status === 'completed' && item.visit_id) {
        payload.visit_id = item.visit_id;
      }
      await registrationQueueApi.updateStatus(item.id, payload);
      toast({
        variant: 'success',
        title: `Tiket ${String(item.ticket_number).padStart(3, '0')} Dipanggil`,
        description: item.status === 'waiting'
          ? 'Antrian telah dimasukkan ke pendaftaran dan siap diproses.'
          : `Nomor antrian ${String(item.ticket_number).padStart(3, '0')} berhasil dipanggil kembali.`,
      });
      void fetchRegistrationQueue();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memanggil antrian',
        description: error.response?.data?.error || 'Tidak dapat memanggil antrian pendaftaran.',
      });
    } finally {
      setProcessingRegistrationTicketId(null);
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
  const completedRegistrationTickets = useMemo(
    () => registrationTickets.filter((item) => item.status === 'completed'),
    [registrationTickets]
  );
  const cancelledRegistrationTickets = useMemo(
    () => registrationTickets.filter((item) => item.status === 'cancelled'),
    [registrationTickets]
  );

  const filteredRegistrationTickets = useMemo(() => {
    let list = registrationTickets;
    if (registrationStatusFilter === 'waiting') list = waitingRegistrationTickets;
    else if (registrationStatusFilter === 'in_service') list = inServiceRegistrationTickets;
    else if (registrationStatusFilter === 'completed') list = completedRegistrationTickets;
    else if (registrationStatusFilter === 'cancelled') list = cancelledRegistrationTickets;

    const q = registrationSearch.trim().toLowerCase();
    if (!q) return list;

    return list.filter((item) => {
      const ticketNum = String(item.ticket_number);
      const ticketPadded = ticketNum.padStart(3, '0');
      const isAnon = !item.patient_id && !item.patient?.id && !item.patient_name && !item.nik;
      const patientType = isAnon ? 'anonim' : item.is_new_patient ? 'baru' : 'lama';
      const patientName = (item.patient?.full_name || item.patient_name || '').toLowerCase();
      const mrn = (item.patient?.medical_record_number || '').toLowerCase();
      const nik = (item.patient?.nik || item.nik || '').toLowerCase();
      const phone = (item.patient?.phone || item.phone || '').toLowerCase();
      const poli = (item.polyclinic?.name || '').toLowerCase();
      const doctor = (item.doctor?.full_name || '').toLowerCase();
      const statusLabel = (REGISTRATION_STATUS_LABEL[item.status] || '').toLowerCase();

      return (
        ticketNum.includes(q) ||
        ticketPadded.includes(q) ||
        patientType.includes(q) ||
        patientName.includes(q) ||
        mrn.includes(q) ||
        nik.includes(q) ||
        phone.includes(q) ||
        poli.includes(q) ||
        doctor.includes(q) ||
        statusLabel.includes(q)
      );
    });
  }, [
    registrationSearch,
    registrationStatusFilter,
    registrationTickets,
    waitingRegistrationTickets,
    inServiceRegistrationTickets,
    completedRegistrationTickets,
    cancelledRegistrationTickets,
  ]);

  const registrationColumns = useMemo<ColumnDef<RegistrationQueueItem>[]>(
    () => [
      {
        id: 'ticket_number',
        header: 'No. Tiket',
        accessorFn: (row) => `${row.ticket_number} ${String(row.ticket_number).padStart(3, '0')} ${(!row.patient_id && !row.patient?.id && !row.patient_name && !row.nik) ? 'anonim' : row.is_new_patient ? 'baru' : 'lama'}`,
        cell: ({ row }) => {
          const item = row.original;
          const isAnonymous = !item.patient_id && !item.patient?.id && !item.patient_name && !item.nik;
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-foreground">
                {String(item.ticket_number).padStart(3, '0')}
              </span>
              <div className="flex flex-col gap-0.5">
                {isAnonymous ? (
                  <Badge variant="outline" className="rounded-none border-zinc-400/60 bg-muted/40 text-muted-foreground shadow-none text-[9px] px-1 py-0 h-4 font-normal leading-none inline-flex items-center">
                    Anonim
                  </Badge>
                ) : item.is_new_patient ? (
                  <Badge className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-none text-[9px] px-1 py-0 h-4 font-normal leading-none inline-flex items-center">
                    Pasien Baru
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-none border-blue-300 bg-blue-50/70 text-blue-700 shadow-none text-[9px] px-1 py-0 h-4 font-normal leading-none inline-flex items-center">
                    Pasien Lama
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatShortTime(item.created_at)}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'patient',
        header: 'Data Pasien',
        accessorFn: (row) =>
          `${row.patient_name || ''} ${row.patient?.full_name || ''} ${row.nik || ''} ${row.patient?.nik || ''} ${row.patient?.medical_record_number || ''} ${row.phone || ''} ${row.patient?.phone || ''}`,
        cell: ({ row }) => {
          const item = row.original;
          const isAnonymous = !item.patient_id && !item.patient?.id && !item.patient_name && !item.nik;
          const patientName = item.patient_name || item.patient?.full_name;
          const mrn = item.patient?.medical_record_number;
          const patientId = item.patient_id || item.patient?.id;
          const patientNik = item.nik || item.patient?.nik;
          const patientPhone = item.phone || item.patient?.phone;

          if (isAnonymous) {
            return (
              <div className="py-0.5 text-xs">
                <span className="text-muted-foreground italic text-xs">Belum diisi (Tiket Anonim)</span>
              </div>
            );
          }

          return (
            <div className="space-y-0.5 text-xs py-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-foreground">{patientName || '-'}</span>
                {mrn && patientId ? (
                  <Link
                    to={`/patients/${patientId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-mono text-[10px] font-bold text-primary hover:underline bg-primary/10 px-1 py-0"
                    title="Buka form edit data pasien"
                  >
                    RM: {mrn} <ExternalLink className="h-2 w-2" />
                  </Link>
                ) : (
                  patientName ? <span className="font-mono text-[10px] text-muted-foreground">RM: -</span> : null
                )}
              </div>
              {(patientNik || patientPhone) ? (
                <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground font-mono">
                  {patientNik && <span>NIK: <span className="text-foreground">{patientNik}</span></span>}
                  {patientNik && patientPhone && <span>•</span>}
                  {patientPhone && <span>HP: <span className="text-foreground">{patientPhone}</span></span>}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'destination',
        header: 'Tujuan Layanan',
        accessorFn: (row) => `${row.polyclinic?.name || ''} ${row.doctor?.full_name || ''}`,
        cell: ({ row }) => {
          const item = row.original;
          if (!item.polyclinic && !item.doctor) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          return (
            <div className="space-y-0.5 text-xs py-0.5">
              {item.polyclinic ? (
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-[200px]">{item.polyclinic.name}</span>
                </div>
              ) : null}
              {item.doctor ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Stethoscope className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[200px]">{item.doctor.full_name}</span>
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status & Waktu',
        accessorFn: (row) => `${row.status} ${REGISTRATION_STATUS_LABEL[row.status] || ''}`,
        cell: ({ row }) => {
          const item = row.original;
          const statusBadge = () => {
            switch (item.status) {
              case 'waiting':
                return <Badge variant="outline" className="rounded-none border-amber-300 bg-amber-50 text-amber-700 shadow-none text-[10px] px-1.5 py-0">Menunggu</Badge>;
              case 'called':
                return <Badge variant="outline" className="rounded-none border-blue-300 bg-blue-50 text-blue-700 shadow-none text-[10px] px-1.5 py-0">Dipanggil</Badge>;
              case 'processing':
                return <Badge variant="outline" className="rounded-none border-violet-300 bg-violet-50 text-violet-700 shadow-none text-[10px] px-1.5 py-0">Diproses</Badge>;
              case 'completed':
                return <Badge variant="outline" className="rounded-none border-emerald-300 bg-emerald-50 text-emerald-700 shadow-none text-[10px] px-1.5 py-0">Selesai</Badge>;
              case 'cancelled':
                return <Badge variant="outline" className="rounded-none border-red-300 bg-red-50 text-red-700 shadow-none text-[10px] px-1.5 py-0">Dibatalkan</Badge>;
              default:
                return <Badge variant="outline" className="rounded-none shadow-none text-[10px] px-1.5 py-0">{item.status}</Badge>;
            }
          };

          const latestTime = item.completed_at
            ? { label: 'Selesai', time: formatShortTime(item.completed_at) }
            : item.processing_started_at
              ? { label: 'Diproses', time: formatShortTime(item.processing_started_at) }
              : item.called_at
                ? { label: 'Dipanggil', time: formatShortTime(item.called_at) }
                : null;

          return (
            <div className="space-y-0.5 py-0.5">
              <div>{statusBadge()}</div>
              {latestTime ? (
                <p className="text-[10px] text-muted-foreground font-mono">
                  {latestTime.label}: {latestTime.time}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Aksi',
        cell: ({ row }) => {
          const item = row.original;
          const isInService = item.status === 'called' || item.status === 'processing';
          const isCompleted = item.status === 'completed';
          const isProcessingThis = processingRegistrationTicketId === item.id;
          const isPrintingThis = printingRegistrationTicketId === item.id;
          const isDeletingThis = deletingRegistrationTicketId === item.id;
          const disabled = isProcessingThis || isPrintingThis || isDeletingThis;

          return (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {item.status !== 'cancelled' && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  onClick={() => void handleProcessRegistrationTicket(item)}
                  disabled={disabled}
                  title={item.status === 'waiting' ? "Panggil dan masukan antrian ke pendaftaran" : "Panggil antrian"}
                >
                  {isProcessingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                </Button>
              )}

              {isInService && (
                <>
                  {item.is_new_patient && (item.patient_id || item.patient?.id) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none border-emerald-500/60 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/70 shadow-none shrink-0"
                      onClick={() => window.open(`/patients/${item.patient_id || item.patient?.id}/edit`, '_blank')}
                      title="Lengkapi data pasien baru"
                    >
                      <Edit className="h-4 w-4 text-emerald-600" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                    onClick={() =>
                      navigate(
                        `/registration/create?ticket_id=${item.id}&patient_id=${item.patient_id || item.patient?.id || ''}&polyclinic_id=${item.polyclinic_id || ''}&doctor_id=${item.doctor_id || ''}&mode=existing`
                      )
                    }
                    title="Daftarkan langsung ke poli kunjungan"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </>
              )}

              {isCompleted && item.visit_id ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                    onClick={() => navigate(`/registration/${item.visit_id}`)}
                    title="Buka Detail Pendaftaran"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                    onClick={() => navigate(`/emr/${item.visit_id}`)}
                    title="Buka EMR Kunjungan"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 rounded-none p-0 shadow-none shrink-0"
                onClick={() => void printRegistrationTicket(item)}
                disabled={disabled}
                title="Cetak Tiket PDF"
                aria-label="Cetak Tiket PDF"
              >
                {isPrintingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 rounded-none p-0 text-destructive shadow-none hover:text-destructive shrink-0"
                onClick={() => setRegistrationDeleteTarget(item)}
                disabled={disabled}
                title="Hapus antrian"
                aria-label="Hapus antrian"
              >
                {isDeletingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          );
        },
      },
    ],
    [
      processingRegistrationTicketId,
      printingRegistrationTicketId,
      deletingRegistrationTicketId,
      handleProcessRegistrationTicket,
      printRegistrationTicket,
      navigate,
    ]
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-card shadow-none">
        {/* Unified Compact Header */}
        <div className="border-b border-border/70 px-3 py-2 bg-card">
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
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-none shadow-none"
                    onClick={() => {
                      setTicketForm({ nik: '', patient_name: '', phone: '', polyclinic_id: '', doctor_id: '' });
                      setTakeTicketDialogOpen(true);
                    }}
                    disabled={takingRegistrationTicket}
                  >
                    {takingRegistrationTicket ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ticket className="mr-1.5 h-3.5 w-3.5" />}
                    Ambil Antrian
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-none shadow-none"
                    onClick={() => window.open('/antrian', '_blank')}
                    title="Buka Website Antrian Mandiri Pasien"
                  >
                    <Globe className="mr-1.5 h-3.5 w-3.5" />
                    Kiosk Publik
                  </Button>
                </>
              )}

              {/* Panggil Berikutnya hanya untuk antrian Poli */}

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
        <div className={`flex min-h-0 flex-1 flex-col ${activeTab === 'pendaftaran' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {(activeTab === 'pendaftaran' || activeTab === 'all') && (
            <div className={`flex min-h-0 flex-col ${activeTab === 'pendaftaran' ? 'flex-1 overflow-hidden' : 'border-b border-border/70'}`}>
              {activeTab === 'all' && (
                <div className="px-4 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border/70">
                  Antrian Pendaftaran
                </div>
              )}

              {/* Table Toolbar / Header matching the standard SIMKLINIK table design */}
              <div className="flex flex-col gap-2.5 border-b border-border/70 bg-card p-3 sm:px-4 sm:py-2.5 xl:flex-row xl:items-center xl:justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={registrationSearch}
                    onChange={(e) => setRegistrationSearch(e.target.value)}
                    placeholder="Cari no. tiket, nama pasien, NIK, No. RM, poli..."
                    className="h-8 w-64 sm:w-80 rounded-none text-xs focus:ring-inset"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 border border-border/70 bg-muted/30 p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={registrationStatusFilter === 'all' ? 'default' : 'ghost'}
                      className="h-7 rounded-none px-2.5 text-xs shadow-none"
                      onClick={() => setRegistrationStatusFilter('all')}
                    >
                      Semua ({registrationTickets.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={registrationStatusFilter === 'waiting' ? 'default' : 'ghost'}
                      className="h-7 rounded-none px-2.5 text-xs shadow-none"
                      onClick={() => setRegistrationStatusFilter('waiting')}
                    >
                      Menunggu ({waitingRegistrationTickets.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={registrationStatusFilter === 'in_service' ? 'default' : 'ghost'}
                      className="h-7 rounded-none px-2.5 text-xs shadow-none"
                      onClick={() => setRegistrationStatusFilter('in_service')}
                    >
                      Masuk Pendaftaran ({inServiceRegistrationTickets.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={registrationStatusFilter === 'completed' ? 'default' : 'ghost'}
                      className="h-7 rounded-none px-2.5 text-xs shadow-none"
                      onClick={() => setRegistrationStatusFilter('completed')}
                    >
                      Selesai ({completedRegistrationTickets.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={registrationStatusFilter === 'cancelled' ? 'default' : 'ghost'}
                      className="h-7 rounded-none px-2.5 text-xs shadow-none"
                      onClick={() => setRegistrationStatusFilter('cancelled')}
                    >
                      Batal ({cancelledRegistrationTickets.length})
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-none px-2.5 text-xs shadow-none shrink-0"
                    onClick={() => void fetchRegistrationQueue()}
                    disabled={refreshingRegistration}
                    title="Muat ulang antrian pendaftaran"
                  >
                    <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshingRegistration && 'animate-spin')} />
                    Segarkan
                  </Button>
                </div>
              </div>

              <div className="p-0 flex-1 min-h-0 overflow-auto">
                <DataTable
                  columns={registrationColumns}
                  data={filteredRegistrationTickets}
                  showSearch={false}
                  showColumnVisibility={false}
                  showSelectionSummary={false}
                  pageSize={10}
                  emptyMessage={
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Tidak ada antrian pendaftaran untuk kategori ini.
                    </div>
                  }
                />
              </div>
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

      {/* Dialog Ambil Antrian Pendaftaran oleh Petugas */}
      <Dialog open={takeTicketDialogOpen} onOpenChange={setTakeTicketDialogOpen}>
        <DialogContent className="max-w-md rounded-none border-border/70">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Ambil Antrian Pendaftaran
            </DialogTitle>
            <DialogDescription className="text-xs">
              Masukkan identitas pasien untuk mengambil nomor antrian. Sistem otomatis memeriksa data NIK pasien.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={takeRegistrationTicketWithData} className="space-y-2.5 py-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">NIK (16 Digit) *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-blue-500 hover:text-primary/80 font-medium hover:bg-primary/5 rounded-none"
                  onClick={() => {
                    const dummy = generateDummyNik();
                    setTicketForm((prev) => ({
                      ...prev,
                      nik: dummy,
                      patient_name: prev.patient_name || '',
                    }));
                  }}
                  title="Buat NIK 16 digit sementara jika pasien tidak membawa identitas/KTP"
                >
                  Generate NIK Dummy
                </Button>
              </div>
              <Input
                value={ticketForm.nik}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, nik: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                placeholder="3201xxxxxxxxxxxx"
                className="h-9 text-xs rounded-none font-mono"
                maxLength={16}
                required
              />
              <p className="text-[10px] text-muted-foreground">
                {ticketForm.nik.length}/16 digit. Jika NIK baru, sistem otomatis membuat No. RM baru.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Nama Lengkap Pasien *</Label>
              <Input
                value={ticketForm.patient_name}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, patient_name: e.target.value }))}
                placeholder="Nama sesuai KTP"
                className="h-9 text-xs rounded-none"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Nomor WhatsApp / HP *</Label>
              <Input
                value={ticketForm.phone}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="08xxxxxxxxxx"
                className="h-9 text-xs rounded-none font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Poliklinik Tujuan (Opsional)</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={polyclinics.map((p) => ({ value: String(p.id), label: p.name }))}
                  value={ticketForm.polyclinic_id}
                  onValueChange={(val) => setTicketForm((prev) => ({ ...prev, polyclinic_id: val, doctor_id: '' }))}
                  placeholder="-- Pilih Poliklinik (Opsional) --"
                  searchPlaceholder="Cari poliklinik..."
                  noneLabel="-- Tidak Memilih / Umum --"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Dokter Tujuan (Opsional)</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={(ticketForm.polyclinic_id
                    ? allDoctors.filter((doc) => doc.polyclinics?.some((poli) => String(poli.id) === ticketForm.polyclinic_id))
                    : allDoctors
                  ).map((doc) => ({
                    value: String(doc.id),
                    label: `${doc.full_name}${doc.specialization ? ` (${doc.specialization})` : ''}`,
                  }))}
                  value={ticketForm.doctor_id}
                  onValueChange={(val) => setTicketForm((prev) => ({ ...prev, doctor_id: val }))}
                  placeholder={ticketForm.polyclinic_id ? '-- Pilih Dokter di Poli Ini --' : '-- Pilih Dokter (Opsional) --'}
                  searchPlaceholder="Cari dokter..."
                  noneLabel="-- Dokter Yang Bertugas --"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full rounded-none shadow-none text-xs"
                disabled={takingRegistrationTicket}
              >
                {takingRegistrationTicket ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ticket className="mr-2 h-4 w-4" />
                )}
                Cetak & Ambil Nomor Antrian
              </Button>
            </div>
          </form>

          <div className="border-t border-border/70 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Keadaan darurat / tanpa data?</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground p-0 underline"
                onClick={() => void takeQuickRegistrationTicket()}
                disabled={takingRegistrationTicket}
              >
                Ambil Tiket Cepat (Anonim)
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-none text-xs shadow-none mt-1"
              onClick={() => {
                setTakeTicketDialogOpen(false);
                window.open('/antrian', '_blank');
              }}
            >
              <Globe className="mr-1.5 h-3.5 w-3.5" />
              Buka Layar Kiosk Mandiri (/antrian)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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