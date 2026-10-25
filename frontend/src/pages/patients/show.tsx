import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ColumnDef } from '@tanstack/react-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { patientsApi, type Patient, type Visit } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { formatDate, formatDateTime } from '@/pages/emr/utils';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CreditCard,
  Edit,
  History,
  Home,
  IdCard,
  Info,
  Loader2,
  MapPin,
  Phone,
  PlusCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  getPatientAgeLabel,
  getPatientGenderLabel,
  getPatientInsuranceLabel,
  getPatientSatusehatChecklist,
  getPatientSatusehatReadyCount,
} from './shared';

const STATUS_LABEL: Record<string, string> = {
  registered: 'Terdaftar',
  in_progress: 'Dalam Konsultasi',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const QUEUE_LABEL: Record<string, string> = {
  waiting: 'Menunggu',
  in_consultation: 'Konsultasi',
  done: 'Selesai',
  cancelled: 'Dibatalkan',
};

function getInitials(name?: string | null): string {
  if (!name) return 'PS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function PatientShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasAnyPermission } = usePermission();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingSatusehat, setSyncingSatusehat] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [activeTab, setActiveTab] = useState('detail');

  const loadPatient = useCallback(async () => {
    const patientId = Number(id);
    try {
      const [patientResponse, historyResponse] = await Promise.all([
        patientsApi.getById(patientId),
        patientsApi.getHistory(patientId),
      ]);
      setPatient(patientResponse.data.data);
      setVisits(historyResponse.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Pasien');
    void loadPatient();
  }, [loadPatient]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await patientsApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Data pasien berhasil dihapus.' });
      navigate('/patients');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal!',
        description: error.response?.data?.error || 'Tidak dapat menghapus pasien.',
      });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const handleSyncSatusehatPatient = async () => {
    if (!patient?.id) return;

    setSyncingSatusehat(true);
    try {
      const response = await patientsApi.syncSatusehat(patient.id);
      toast({
        variant: 'success',
        title: 'Sync berhasil',
        description: response.data?.message || 'Patient berhasil dikirim ke SATUSEHAT.',
      });
      await loadPatient();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal sync patient',
        description: error.response?.data?.error || 'Sinkronisasi Patient SATUSEHAT gagal dijalankan.',
      });
    } finally {
      setSyncingSatusehat(false);
    }
  };

  const visitColumns = useMemo<ColumnDef<Visit>[]>(
    () => [
      {
        accessorKey: 'visit_number',
        header: 'No. Kunjungan',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => (
          <div className="min-w-[130px] space-y-0.5">
            <span className="font-mono text-sm sm:text-base font-bold text-foreground">
              {row.original.visit_number}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {(row.original as any).visit_type || 'Rawat Jalan'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'visit_date',
        header: 'Tanggal',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => (
          <div className="min-w-[120px] space-y-0.5">
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {formatDate(row.original.visit_date)}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {row.original.created_at ? new Date(row.original.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
          </div>
        ),
      },
      {
        id: 'polyclinic',
        header: 'Poliklinik',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-0.5">
            <span className="text-sm font-bold text-foreground">
              {(row.original as any).polyclinic?.name || '-'}
            </span>
            <p className="text-xs text-muted-foreground">
              {(row.original as any).polyclinic?.code || 'Poli Klinik'}
            </p>
          </div>
        ),
      },
      {
        id: 'doctor',
        header: 'Dokter',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => (
          <div className="min-w-[150px] space-y-0.5">
            <span className="text-sm font-semibold text-foreground">
              {(row.original as any).doctor?.full_name || '-'}
            </span>
            <p className="text-xs text-muted-foreground">
              {(row.original as any).doctor?.specialization || 'Dokter Pemeriksa'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'complaint',
        header: 'Keluhan',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => (
          <div className="min-w-[190px] max-w-[280px] space-y-0.5">
            <span className="text-sm text-foreground/95 font-medium line-clamp-1" title={row.original.complaint || '-'}>
              {row.original.complaint || '-'}
            </span>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {(row.original as any).diagnoses?.[0]?.diagnosis_name || 'Pemeriksaan Umum'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: {
          headerClassName: 'py-3 px-3.5 text-sm font-bold text-foreground',
          cellClassName: 'py-3 px-3.5 align-middle',
        },
        cell: ({ row }) => {
          const status = (row.original.status || '').toLowerCase();
          const isDone = status === 'completed' || status === 'selesai' || status === 'done';
          const isExam = status === 'in_progress' || status === 'in_consultation' || status === 'examination';
          const isCancelled = status === 'cancelled' || status === 'batal';

          return (
            <div className="min-w-[140px] space-y-1">
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-none uppercase font-mono tracking-wide border',
                  isDone && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                  isExam && 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
                  isCancelled && 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
                  !isDone && !isExam && !isCancelled && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                )}
              >
                {STATUS_LABEL[row.original.status] || row.original.status || 'Terdaftar'}
              </span>
              {row.original.queue_status && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Antrean: {QUEUE_LABEL[row.original.queue_status] || row.original.queue_status}
                </p>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="rounded-xl border border-border/80 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Pasien tidak ditemukan</h1>
          <p className="mt-2 text-sm text-muted-foreground">Data pasien ini tidak tersedia atau sudah dihapus.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/patients')}>Kembali ke daftar pasien</Button>
          </div>
        </div>
      </div>
    );
  }

  const formatValue = (value?: string | null, fallback = '-') => value || fallback;
  const ageLabel = getPatientAgeLabel(patient.birth_date);
  const canSyncSatusehat = hasAnyPermission(['settings.update', 'patients.update']);
  const satusehatChecklist = getPatientSatusehatChecklist(patient);
  const satusehatReadyCount = getPatientSatusehatReadyCount(patient);

  return (
    <>
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Hapus Pasien?"
        description={`Data pasien "${patient.full_name}" akan dihapus permanen.`}
        onConfirm={handleDelete}
        confirmText={deleting ? 'Menghapus...' : 'Ya, Hapus'}
        variant="destructive"
      />

      <div className="p-4 lg:p-6 bg-muted/20 min-h-full">
        {/* Satu Card Utuh Menggabungkan Header dan Body Sesuai Index SIMKLINIK */}
        <div className="border border-border/80 bg-card shadow-none">
          <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => navigate('/patients')}
                aria-label="Kembali"
                title="Kembali"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                    Profil & Data Pasien
                  </h1>
                  <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide font-mono shadow-none">
                    {patient.medical_record_number}
                  </Badge>
                  <Badge className={patient.is_active !== false ? "h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none" : "h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none"}>
                    {patient.is_active !== false ? "Pasien Aktif" : "Nonaktif"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Informasi administratif, identitas lengkap, dan riwayat rekam medis pasien
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none border-amber-500/80 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 shadow-none"
                onClick={() => navigate(`/patients/${id}/edit`)}
              >
                <Edit className="size-3.5" />
                Edit
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none shadow-none"
                onClick={() => navigate(`/registration/create?patient_id=${patient.id}`)}
              >
                <PlusCircle className="size-3.5" />
                Daftarkan Kunjungan
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none shadow-none"
                onClick={() => window.print()}
              >
                <Printer className="size-3.5" />
                Cetak Label
              </Button>

              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-none"
                onClick={() => window.print()}
              >
                <Printer className="size-3.5" />
                Cetak / PDF
              </Button>

              {canSyncSatusehat ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs rounded-none shadow-none"
                  onClick={() => void handleSyncSatusehatPatient()}
                  disabled={syncingSatusehat}
                >
                  {syncingSatusehat ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {patient.satusehat_patient_id ? 'Sync SATUSEHAT' : 'Sync SATUSEHAT'}
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 shadow-none"
                onClick={() => setShowDelete(true)}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Hapus
              </Button>
            </div>
          </div>

          {/* Card Body Langsung di Dalam Card yang Sama */}
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* KOLOM KIRI: Card Profil Pasien */}
              <div className="lg:col-span-4 xl:col-span-3 space-y-4">
                <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                  {/* Badge ACTIVE di pojok kanan atas */}
                  <div className="absolute top-3.5 right-3.5">
                    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {patient.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

              {/* Avatar & Identitas Singkat */}
              <div className="flex flex-col items-center text-center pt-2 pb-4 border-b border-border/60">
                <div className="w-24 h-28 rounded-lg overflow-hidden bg-zinc-900 text-white flex items-center justify-center font-bold text-2xl shadow-sm mb-3">
                  {getInitials(patient.full_name)}
                </div>
                <h2 className="text-base font-bold tracking-tight text-foreground uppercase">
                  {patient.full_name}
                </h2>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {patient.medical_record_number} • {patient.nik || 'NIK: -'}
                </p>
                <div className="mt-2.5">
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground uppercase tracking-wide">
                    {patient.occupation || getPatientInsuranceLabel(patient.insurance_type)}
                  </span>
                </div>
              </div>

              {/* Data Detail Singkat Kiri */}
              <div className="pt-4 space-y-3.5 text-xs">
                <div className="flex items-start gap-2.5">
                  <User className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">GENDER / UMUR</p>
                    <p className="font-medium text-foreground">{getPatientGenderLabel(patient.gender)} • {ageLabel}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Phone className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">KONTAK</p>
                    <p className="font-medium text-foreground">{patient.phone || '-'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">DOMISILI</p>
                    <p className="font-medium text-foreground">{patient.city || patient.province || '-'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CreditCard className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">PENJAMIN / ASURANSI</p>
                    <p className="font-medium text-foreground">
                      {getPatientInsuranceLabel(patient.insurance_type)}
                      {patient.insurance_number ? ` • ${patient.insurance_number}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Box Berbingkai Merah Muda Status Kunjungan */}
              <div className="mt-5 rounded-lg border border-rose-200 dark:border-rose-950 bg-rose-50/60 dark:bg-rose-950/20 p-3.5 space-y-2.5">
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                  <span>▾</span> STATUS PASIEN & REKAM MEDIS
                </p>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">STATUS & KATEGORI</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">
                    {patient.is_active !== false ? 'Pasien Aktif' : 'Nonaktif'} • {getPatientInsuranceLabel(patient.insurance_type)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">RIWAYAT KUNJUNGAN</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">
                    {visits.length} Kunjungan {visits[0] ? `(Terakhir: ${formatDate(visits[0].visit_date)})` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* KOLOM KANAN: Tabs Detail Profil & Rekap */}
          <div className="lg:col-span-8 xl:col-span-9">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-4"
            >
                <TabsList className="h-auto w-full justify-start rounded-none border-b border-border/70 bg-transparent p-0 gap-6">
                  <TabsTrigger
                    value="detail"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <UserCheck className="size-4" />
                    Detail Profil
                  </TabsTrigger>
                  <TabsTrigger
                    value="kunjungan"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <History className="size-4" />
                    Rekap Kunjungan
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">{visits.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="satusehat"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <ShieldCheck className="size-4" />
                    Kesiapan SATUSEHAT
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">{satusehatReadyCount}/{satusehatChecklist.length}</span>
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: DETAIL PROFIL (Format Data Table) */}
                <TabsContent value="detail" className="mt-4 space-y-4">
                  {/* Table 1: IDENTITAS LENGKAP */}
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center gap-2 border-b border-border/80 bg-muted/20 px-4 py-2.5">
                      <IdCard className="size-4 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Identitas Lengkap Pasien</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y divide-border/60">
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Tempat Lahir</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue(patient.birth_place)}</td>
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Tanggal Lahir</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground">{patient.birth_date ? formatDate(patient.birth_date) : '-'} <span className="text-muted-foreground">({ageLabel})</span></td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Jenis Kelamin</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{getPatientGenderLabel(patient.gender)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Golongan Darah</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.blood_type, '- (-)')}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Agama</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue(patient.religion)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Status Pernikahan</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.marital_status)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Pendidikan Terakhir</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue(patient.education)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Pekerjaan</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.occupation)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 2: INFORMASI ALAMAT */}
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center gap-2 border-b border-border/80 bg-muted/20 px-4 py-2.5">
                      <Home className="size-4 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Informasi Alamat & Domisili</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y divide-border/60">
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Alamat KTP / Domisili</td>
                            <td colSpan={3} className="px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.address)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">RT / RW & Kelurahan</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">
                              {patient.rt || patient.rw ? `RT ${patient.rt || '-'}/RW ${patient.rw || '-'}` : '-'} • {formatValue(patient.kelurahan)}
                            </td>
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Kecamatan & Kota</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground">
                              {formatValue(patient.kecamatan)} • {formatValue(patient.city)}
                            </td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Provinsi</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue(patient.province)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Kode Pos</td>
                            <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">{formatValue(patient.postal_code)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 3: KELUARGA & PENANGGUNG JAWAB */}
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center gap-2 border-b border-border/80 bg-muted/20 px-4 py-2.5">
                      <Users className="size-4 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Keluarga & Penanggung Jawab</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y divide-border/60">
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Nama Ayah / Keluarga</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue((patient as any).parent_name || patient.emergency_contact_name)}</td>
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Nama Ibu / Pasangan</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.emergency_contact_name)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Penanggung Jawab (PJ)</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">{formatValue(patient.emergency_contact_name)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Hubungan Keluarga</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{formatValue(patient.emergency_contact_relation)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">No. Telp PJ / Darurat</td>
                            <td className="px-3.5 py-2.5 font-mono font-medium text-foreground border-r border-border/60">{formatValue(patient.emergency_contact_phone)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Email Pasien</td>
                            <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">{formatValue(patient.email)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 4: LEGALITAS & ASURANSI / SATUSEHAT */}
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center gap-2 border-b border-border/80 bg-muted/20 px-4 py-2.5">
                      <ShieldCheck className="size-4 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Legalitas, Asuransi & Rekening Kesehatan</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y divide-border/60">
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">NIK Kependudukan</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-mono font-medium text-foreground border-r border-border/60">{formatValue(patient.nik)}</td>
                            <td className="w-1/4 sm:w-1/6 bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">ID SATUSEHAT (IHS)</td>
                            <td className="w-1/4 sm:w-2/6 px-3.5 py-2.5 font-mono font-medium text-foreground">{formatValue(patient.satusehat_patient_id)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">BPJS / No. Asuransi</td>
                            <td className="px-3.5 py-2.5 font-mono font-medium text-foreground border-r border-border/60">{formatValue(patient.insurance_number)}</td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Tipe Penjamin</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{getPatientInsuranceLabel(patient.insurance_type)}</td>
                          </tr>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Status SATUSEHAT</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">
                              {patient.satusehat_patient_id ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <span className="size-2 rounded-full bg-emerald-500"></span>
                                  Terhubung SATUSEHAT
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                  <span className="size-2 rounded-full bg-zinc-400"></span>
                                  Belum Sinkron
                                </span>
                              )}
                            </td>
                            <td className="bg-muted/20 px-3.5 py-2.5 font-semibold text-muted-foreground uppercase text-[11px] border-r border-border/60">Status Akun</td>
                            <td className="px-3.5 py-2.5 font-medium text-foreground">
                              {patient.is_active !== false ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <span className="size-2 rounded-full bg-emerald-500"></span>
                                  Aktif Terdaftar
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                                  <span className="size-2 rounded-full bg-rose-500"></span>
                                  Nonaktif
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 5: CATATAN KLINIS & ALERGI */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="border border-amber-200 dark:border-amber-950 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
                      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                        <Info className="size-3.5" />
                        RIWAYAT ALERGI
                      </p>
                      <p className="text-xs text-foreground mt-1.5 font-medium leading-relaxed">
                        {formatValue(patient.allergies, 'Tidak ada riwayat alergi yang tercatat.')}
                      </p>
                    </div>
                    <div className="border border-border/80 bg-muted/20 p-3.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Info className="size-3.5" />
                        CATATAN KHUSUS / PERINGATAN
                      </p>
                      <p className="text-xs text-foreground mt-1.5 leading-relaxed">
                        {formatValue(patient.notes, 'Tidak ada catatan klinis khusus.')}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: REKAP KUNJUNGAN */}
                <TabsContent value="kunjungan" className="mt-4">
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <History className="size-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Rekap Riwayat Kunjungan Pasien
                        </h3>
                      </div>
                      <Badge variant="outline" className="h-6 rounded-none px-2.5 text-xs font-mono font-semibold self-start sm:self-auto">
                        Total {visits.length} Riwayat Kunjungan
                      </Badge>
                    </div>
                    <div className="p-0">
                      <DataTable
                        columns={visitColumns}
                        data={visits}
                        borderless={false}
                        showSearch={false}
                        showSelectionSummary={false}
                        pageSize={10}
                        emptyMessage={
                          <div className="p-10 text-center text-sm text-muted-foreground">
                            Belum ada riwayat kunjungan untuk pasien ini.
                          </div>
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 3: KESIAPAN SATUSEHAT */}
                <TabsContent value="satusehat" className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {satusehatChecklist.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-3 border border-border/70 bg-card rounded-lg p-3.5">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-foreground">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                        </div>
                        <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-md whitespace-nowrap text-[10px]">
                          {item.ready ? 'Siap' : 'Lengkapi'}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/10 p-4 text-xs space-y-2">
                    <p className="font-semibold text-foreground">Metadata Sistem Pasien</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-muted-foreground">
                      <div>Terdaftar: {formatDateTime(patient.created_at)}</div>
                      <div>Terakhir Diperbarui: {formatDateTime(patient.updated_at)}</div>
                      <div>Status Akun: {patient.is_active ? 'Aktif' : 'Nonaktif'}</div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}