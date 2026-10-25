import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { visitsApi, type Visit } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Ticket,
  UserPlus,
} from 'lucide-react';

const PAYMENT_LABEL: Record<string, string> = {
  umum: 'Umum (Mandiri)',
  bpjs: 'BPJS Kesehatan',
  asuransi: 'Asuransi Swasta',
};

const QUEUE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  waiting: { label: 'Menunggu di Poli', className: 'border-amber-300 bg-amber-50 text-amber-700' },
  in_consultation: { label: 'Sedang Konsultasi', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  done: { label: 'Selesai Pelayanan', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Dibatalkan', className: 'border-red-300 bg-red-50 text-red-700' },
};

function formatDisplayDate(dateStr?: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDisplayDateTime(dateStr?: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calculateAge(birthDateStr?: string) {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} thn`;
}

export default function RegistrationShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVisit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await visitsApi.getById(Number(id));
      const data: Visit = response.data.data;
      setVisit(data);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal memuat detail pendaftaran.',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Pendaftaran Pasien');
    void loadVisit();
  }, [loadVisit]);

  const handlePrintKarcis = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="p-6">
        <div className="border border-border bg-card p-8 text-center">
          <Ticket className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Data Pendaftaran Tidak Ditemukan</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pendaftaran dengan ID #{id} tidak ditemukan di sistem.</p>
          <Button
            type="button"
            className="mt-4 rounded-none shadow-none"
            onClick={() => navigate('/queue')}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Kembali ke Antrian
          </Button>
        </div>
      </div>
    );
  }

  const queueStatus = QUEUE_STATUS_LABEL[visit.queue_status] || {
    label: visit.queue_status || 'Menunggu',
    className: 'border-border bg-muted/30 text-foreground',
  };

  const patient = visit.patient;
  const patientAge = patient?.birth_date ? calculateAge(patient.birth_date) : '';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Print-only Karcis Slip */}
      <div className="hidden print:block font-mono text-black p-4 max-w-[320px] mx-auto text-center border border-black">
        <h2 className="text-base font-black uppercase tracking-wider">SIM KLINIK</h2>
        <p className="text-[10px] text-gray-600">Karcis Antrian Pelayanan Poli</p>
        <div className="my-2 border-b border-dashed border-black" />
        <p className="text-[11px] text-gray-700">NOMOR ANTRIAN POLI</p>
        <p className="text-5xl font-black my-2">{String(visit.queue_number).padStart(3, '0')}</p>
        <p className="text-sm font-bold uppercase">{visit.polyclinic?.name || '-'}</p>
        <p className="text-xs">{visit.doctor?.full_name || '-'}</p>
        <div className="my-2 border-b border-dashed border-black" />
        <div className="text-left text-xs space-y-1">
          <p><strong>No. RM:</strong> {patient?.medical_record_number || '-'}</p>
          <p><strong>Pasien:</strong> {patient?.full_name || '-'}</p>
          <p><strong>Penjamin:</strong> {PAYMENT_LABEL[visit.payment_type] || visit.payment_type}</p>
          <p><strong>Tanggal:</strong> {visit.visit_date} ({formatDisplayDateTime(visit.created_at)})</p>
        </div>
        <div className="my-2 border-b border-dashed border-black" />
        <p className="text-[10px] italic">Silakan menunggu panggilan antrian di ruang tunggu poli. Terima kasih.</p>
      </div>

      {/* Screen View */}
      <div className="print:hidden flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="border border-border/70 bg-card shadow-none">
          {/* Card Header Bar */}
          <div className="flex items-center justify-between p-4 border-b border-border/70">
            <div className="flex items-center gap-3 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-none shadow-none shrink-0"
                    onClick={() => navigate('/registration')}
                    aria-label="Kembali ke Pendaftaran"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Kembali ke Pendaftaran</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
                <FileText className="h-4 w-4 text-primary" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">
                    Detail Pendaftaran Pasien
                  </h1>
                  <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
                    #{visit.visit_number}
                  </Badge>
                  <Badge variant="outline" className={`rounded-none text-xs shadow-none ${queueStatus.className}`}>
                    {queueStatus.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Kunjungan terdaftar pada {formatDisplayDateTime(visit.created_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Card Section 1: Identitas Pasien */}
          <div className="border-b border-border/70 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-1 shrink-0 bg-primary/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  1. Identitas Pasien
                </span>
              </div>
              {patient ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-none text-[11px] font-mono">
                    RM: {patient.medical_record_number}
                  </Badge>
                  {patient.id ? (
                    <Link
                      to={`/patients/${patient.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      Profil Pasien <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-border/70 bg-muted/15 p-3 text-xs">
              <div>
                <p className="font-bold text-foreground text-sm">{patient?.full_name || '-'}</p>
                <p className="font-mono text-muted-foreground">{patient?.medical_record_number || '-'}</p>
                <p className="text-muted-foreground mt-0.5">
                  {patient?.gender === 'L' ? 'Laki-laki' : patient?.gender === 'P' ? 'Perempuan' : '-'}
                  {patientAge ? ` · ${patientAge}` : ''}
                </p>
              </div>
              <div className="space-y-0.5 text-muted-foreground">
                <p>NIK: <span className="font-mono text-foreground">{patient?.nik || '-'}</span></p>
                <p>Telepon: <span className="text-foreground">{patient?.phone || '-'}</span></p>
                <p>
                  Penjamin:{' '}
                  <span className="font-medium text-foreground">
                    {PAYMENT_LABEL[visit.payment_type] || visit.payment_type}
                  </span>
                  {visit.insurance_number ? (
                    <span className="font-mono text-xs ml-1">({visit.insurance_number})</span>
                  ) : null}
                </p>
              </div>
              <div className="text-muted-foreground">
                <p>Alamat:</p>
                <p className="text-foreground mt-0.5 leading-relaxed">{patient?.address || '-'}</p>
              </div>
            </div>
          </div>

          {/* Card Section 2: Parameter Kunjungan & Pelayanan Poli */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-1 shrink-0 bg-primary/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Parameter Kunjungan & Pelayanan Poli
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">No. Antrian Poli:</span>
                <span className="font-mono text-lg font-black text-primary">
                  {String(visit.queue_number).padStart(3, '0')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Poliklinik Tujuan</span>
                <p className="font-bold text-foreground text-sm">{visit.polyclinic?.name || '-'}</p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Dokter Pemeriksa</span>
                <p className="font-bold text-foreground text-sm">{visit.doctor?.full_name || 'Dokter belum dipilih'}</p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Tanggal Kunjungan</span>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDisplayDate(visit.visit_date)}
                </p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Metode Pembayaran</span>
                <p className="font-medium text-foreground">{PAYMENT_LABEL[visit.payment_type] || visit.payment_type}</p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Tipe Kunjungan</span>
                <p className="font-medium text-foreground capitalize">
                  {visit.visit_type === 'baru' ? 'Pasien Baru' : 'Pasien Lama'}
                </p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Tingkat Prioritas</span>
                <p className="font-medium text-foreground">
                  {visit.priority === 'urgent' ? (
                    <span className="text-orange-600 font-bold">Urgent</span>
                  ) : (
                    'Normal'
                  )}
                </p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Petugas Pendaftaran</span>
                <p className="font-medium text-foreground">
                  {visit.registered_by_user?.full_name || visit.registered_by_user?.username || 'Petugas Front Office'}
                </p>
              </div>

              <div className="space-y-1 border border-border/60 bg-muted/10 p-2.5">
                <span className="text-muted-foreground block text-[11px]">Status Pelayanan</span>
                <p className="font-medium uppercase text-foreground">{visit.status || '-'}</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium text-muted-foreground">Keluhan Utama / Catatan</span>
              <div className="border border-border/60 bg-muted/20 p-2.5 min-h-[50px] text-xs text-foreground leading-relaxed">
                {visit.complaint || 'Tidak ada keluhan utama yang dicatat.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="print:hidden shrink-0 border-t border-border/70 bg-card/95 px-4 py-3 sm:px-6 sm:py-3.5 backdrop-blur z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-none shadow-none"
                onClick={() => navigate('/registration')}
                aria-label="Kembali ke Pendaftaran"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Kembali ke Pendaftaran</p>
            </TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none shadow-none"
                  onClick={() => void loadVisit()}
                  aria-label="Segarkan Data"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Segarkan Data</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none shadow-none"
                  onClick={handlePrintKarcis}
                  aria-label="Cetak Karcis Antrian"
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Cetak Karcis Antrian</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none shadow-none"
                  onClick={() => navigate('/registration/create')}
                  aria-label="Daftar Pasien Baru"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Daftar Pasien Baru</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8 rounded-none shadow-none"
                  onClick={() => navigate(`/emr/${visit.id}`)}
                  aria-label="Lanjut ke Rekam Medis (EMR)"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Lanjut ke Rekam Medis (EMR)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
