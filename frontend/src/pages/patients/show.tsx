import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { patientsApi, type Patient, type Visit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Loader2, ArrowLeft, Edit, Trash2, PlusCircle, Calendar, MapPin, ShieldCheck, User, ClipboardList, CircleCheck, CircleX } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function calcAge(birth: string): number {
  const diff = Date.now() - new Date(birth).getTime();
  return Math.floor(diff / 31557600000);
}

function fmt(val?: string | null, fallback = '-') {
  return val || fallback;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  registered: 'Terdaftar', in_progress: 'Dalam Konsultasi', completed: 'Selesai', cancelled: 'Dibatalkan',
};
const QUEUE_LABEL: Record<string, string> = {
  waiting: 'Menunggu', in_consultation: 'Konsultasi', done: 'Selesai', cancelled: 'Dibatalkan',
};

export default function PatientShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Pasien');
    const pid = Number(id);
    Promise.all([
      patientsApi.getById(pid),
      patientsApi.getHistory(pid),
    ]).then(([pRes, hRes]) => {
      setPatient(pRes.data.data);
      setVisits(hRes.data.data || []);
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    }).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await patientsApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Data pasien berhasil dihapus.' });
      navigate('/patients');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal!', description: e.response?.data?.error || 'Tidak dapat menghapus pasien.' });
    } finally {
      setDeleting(false); setShowDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat detail pasien...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold">Pasien tidak ditemukan</p>
          <p className="mt-1 text-sm text-muted-foreground">Data pasien ini tidak tersedia atau sudah dihapus.</p>
          <Button onClick={() => navigate('/patients')} className="mt-5">Kembali ke Pasien</Button>
        </div>
      </div>
    );
  }

  const age = patient.birth_date ? calcAge(patient.birth_date) : null;
  const insuranceLabel: Record<string, string> = { umum: 'Umum', bpjs: 'BPJS', asuransi: 'Asuransi Swasta' };

  return (
    <div className="p-4">
      <ConfirmDialog
        open={showDelete} onOpenChange={setShowDelete}
        title="Hapus Pasien?" description={`Data pasien "${patient.full_name}" akan dihapus permanen.`}
        onConfirm={handleDelete} confirmText={deleting ? 'Menghapus...' : 'Ya, Hapus'}
        variant="destructive"
      />

      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/patients')} className="h-9 w-9 shrink-0 rounded-md">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Kembali ke Pasien</span>
                </Button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">{patient.medical_record_number}</Badge>
                    <Badge className={patient.is_active ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white' : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'}>
                      {patient.is_active ? 'AKTIF' : 'NONAKTIF'}
                    </Badge>
                    <Badge className="h-6 rounded-md border-0 bg-amber-500 px-2 text-[11px] font-semibold text-white">{patient.gender === 'L' ? 'LAKI-LAKI' : 'PEREMPUAN'}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate(`/registration/create?patient_id=${patient.id}`)}>
                <PlusCircle className="h-4 w-4" />
                Daftarkan Kunjungan
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/patients/${id}/edit`)}>
                <Edit className="h-4 w-4" />
                Edit Pasien
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Hapus Pasien
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Usia</p>
              <p className="text-sm font-medium">{age !== null ? `${age} tahun` : '-'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Telepon</p>
              <p className="truncate text-sm font-medium">{fmt(patient.phone)}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Asuransi</p>
              <p className="text-sm font-medium">{insuranceLabel[patient.insurance_type || 'umum'] || fmt(patient.insurance_type)}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Kunjungan</p>
              <p className="text-sm font-medium">{visits.length} riwayat</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Informasi Pasien</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><User className="h-4 w-4" />Identitas</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoItem label="Nama Lengkap" value={patient.full_name} />
                    <InfoItem label="NIK" value={fmt(patient.nik)} />
                    <InfoItem label="Tempat Lahir" value={fmt(patient.birth_place)} />
                    <InfoItem label="Tanggal Lahir" value={patient.birth_date ? `${new Date(patient.birth_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}${age !== null ? ` (${age} thn)` : ''}` : '-'} />
                    <InfoItem label="Golongan Darah" value={fmt(patient.blood_type)} />
                    <InfoItem label="Status Nikah" value={fmt(patient.marital_status)} />
                    <InfoItem label="Agama" value={fmt(patient.religion)} />
                    <InfoItem label="Pendidikan" value={fmt(patient.education)} />
                    <InfoItem label="Pekerjaan" value={fmt(patient.occupation)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><MapPin className="h-4 w-4" />Alamat & Kontak</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2"><InfoItem label="Alamat" value={fmt(patient.address)} /></div>
                    <InfoItem label="RT/RW" value={patient.rt || patient.rw ? `${patient.rt || '-'}/${patient.rw || '-'}` : '-'} />
                    <InfoItem label="Kelurahan" value={fmt(patient.kelurahan)} />
                    <InfoItem label="Kecamatan" value={fmt(patient.kecamatan)} />
                    <InfoItem label="Kota" value={fmt(patient.city)} />
                    <InfoItem label="Provinsi" value={fmt(patient.province)} />
                    <InfoItem label="Kode Pos" value={fmt(patient.postal_code)} />
                    <InfoItem label="Telepon" value={fmt(patient.phone)} />
                    <InfoItem label="Email" value={fmt(patient.email)} />
                    <InfoItem label="Kontak Darurat" value={fmt(patient.emergency_contact_name)} />
                    <InfoItem label="Hubungan" value={fmt(patient.emergency_contact_relation)} />
                    <InfoItem label="Telepon Darurat" value={fmt(patient.emergency_contact_phone)} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-4 w-4" />Asuransi & Catatan Medis</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoItem label="Tipe Asuransi" value={insuranceLabel[patient.insurance_type || 'umum'] || fmt(patient.insurance_type)} />
                  {patient.insurance_type !== 'umum' && <InfoItem label="Nomor Asuransi" value={fmt(patient.insurance_number)} />}
                  <div className="md:col-span-2"><InfoItem label="Alergi" value={fmt(patient.allergies, 'Tidak ada data alergi')} /></div>
                  <div className="md:col-span-2"><InfoItem label="Catatan" value={fmt(patient.notes, 'Tidak ada catatan tambahan')} /></div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><ClipboardList className="h-4 w-4" />Riwayat Kunjungan</p>
                {visits.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    Belum ada riwayat kunjungan.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visits.map(v => (
                      <div key={v.id} className="rounded-lg border p-4">
                        <div className="grid gap-3 md:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Tanggal</p>
                            <p className="text-sm font-medium">{new Date(v.visit_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <p className="text-xs font-mono text-muted-foreground">{v.visit_number}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Poliklinik</p>
                            <p className="text-sm font-medium">{(v as any).polyclinic?.name || '-'}</p>
                            <p className="text-xs text-muted-foreground">{(v as any).doctor?.full_name || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Keluhan</p>
                            <p className="text-sm">{fmt(v.complaint)}</p>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Badge variant="outline" className="w-fit text-xs">{STATUS_LABEL[v.status] || v.status}</Badge>
                            <Badge variant="secondary" className="w-fit text-xs">{QUEUE_LABEL[v.queue_status] || v.queue_status}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Status Pasien</p>
                <p className="flex items-center gap-2 font-medium">
                  {patient.is_active ? <CircleCheck className="h-4 w-4 text-muted-foreground" /> : <CircleX className="h-4 w-4 text-destructive" />}
                  {patient.is_active ? 'Pasien Aktif' : 'Pasien Tidak Aktif'}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {patient.created_at ? new Date(patient.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {patient.updated_at ? new Date(patient.updated_at).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </p>
              </div>

              <Button className="w-full" variant="outline" onClick={() => navigate('/patients')}>
                Kembali ke Daftar Pasien
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
