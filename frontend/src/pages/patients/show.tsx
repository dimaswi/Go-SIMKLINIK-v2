import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { patientsApi, type Patient, type Visit } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { formatDate, formatDateTime } from '@/pages/emr/utils';
import { Edit, Loader2, PlusCircle, RefreshCw, Trash2 } from 'lucide-react';
import {
  PatientDetailItem,
  PatientPageShell,
  PatientPanelSection,
  PatientSection,
  getPatientAddressLabel,
  getPatientAgeLabel,
  getPatientEmergencyLabel,
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

  const loadPatient = useCallback(async () => {
    const patientId = Number(id);
    try {
      const [patientResponse, historyResponse] = await Promise.all([patientsApi.getById(patientId), patientsApi.getHistory(patientId)]);
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

      <PatientPageShell
        title={patient.full_name}
        subtitle="Ringkasan administratif pasien dengan pola tampilan yang disederhanakan seperti halaman rekam medis terbaru."
        onBack={() => navigate('/patients')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
              {patient.medical_record_number}
            </Badge>
            <Badge className={patient.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {patient.is_active ? 'Pasien Aktif' : 'Nonaktif'}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none">
              {getPatientGenderLabel(patient.gender)}
            </Badge>
            <Badge className={satusehatReadyCount === satusehatChecklist.length ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {satusehatReadyCount}/{satusehatChecklist.length} SATUSEHAT
            </Badge>
          </>
        }
        meta={
          <>
            <span>Usia {ageLabel}</span>
            <span>Telepon {formatValue(patient.phone)}</span>
            <span>Asuransi {getPatientInsuranceLabel(patient.insurance_type)}</span>
            <span>{visits.length} riwayat kunjungan</span>
          </>
        }
        actions={
          <>
            {canSyncSatusehat ? (
              <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={() => void handleSyncSatusehatPatient()} disabled={syncingSatusehat}>
                {syncingSatusehat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {patient.satusehat_patient_id ? 'Sync Ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}
              </Button>
            ) : null}
            <Button className="gap-1.5 rounded-none shadow-none" onClick={() => navigate(`/registration/create?patient_id=${patient.id}`)}>
              <PlusCircle className="h-4 w-4" />
              Daftarkan Kunjungan
            </Button>
            <Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={() => navigate(`/patients/${id}/edit`)}>
              <Edit className="h-4 w-4" />
              Edit Pasien
            </Button>
            <Button variant="destructive" className="gap-1.5 rounded-none shadow-none" onClick={() => setShowDelete(true)} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Hapus Pasien
            </Button>
          </>
        }
        aside={
          <div className="divide-y divide-border/70">
            <PatientPanelSection title="Status Integrasi">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={patient.satusehat_patient_id ? 'default' : 'secondary'} className="rounded-none">
                    {patient.satusehat_patient_id ? 'Patient tersinkron' : 'Belum sync SATUSEHAT'}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Patient ID SATUSEHAT: <span className="font-medium text-foreground break-all">{patient.satusehat_patient_id || '-'}</span></p>
                  <p>Sync terakhir: <span className="font-medium text-foreground">{formatDateTime(patient.satusehat_synced_at)}</span></p>
                  <p>NIK: <span className="font-medium text-foreground">{formatValue(patient.nik)}</span></p>
                </div>
              </div>
            </PatientPanelSection>

            <PatientPanelSection title="Kontak Ringkas" helper="Informasi yang paling sering dipakai saat registrasi ulang.">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Alamat: {getPatientAddressLabel(patient)}</p>
                <p>Kontak darurat: {getPatientEmergencyLabel(patient)}</p>
                <p>Email: {formatValue(patient.email)}</p>
              </div>
            </PatientPanelSection>
          </div>
        }
      >
        <div className="divide-y divide-border/70">
          <PatientSection title="Identitas Dan Domisili" helper="Informasi inti pasien ditampilkan tanpa kartu terpisah agar lebih cepat dipindai seperti workspace EMR terbaru.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="grid gap-x-6 gap-y-4 border border-border/70 bg-muted/[0.03] p-4 md:grid-cols-2">
                <PatientDetailItem label="Nama Lengkap" value={patient.full_name} />
                <PatientDetailItem label="NIK" value={formatValue(patient.nik)} />
                <PatientDetailItem label="Tempat Lahir" value={formatValue(patient.birth_place)} />
                <PatientDetailItem label="Tanggal Lahir" value={patient.birth_date ? `${formatDate(patient.birth_date)}${ageLabel !== '-' ? ` (${ageLabel})` : ''}` : '-'} />
                <PatientDetailItem label="Golongan Darah" value={formatValue(patient.blood_type)} />
                <PatientDetailItem label="Status Pernikahan" value={formatValue(patient.marital_status)} />
                <PatientDetailItem label="Agama" value={formatValue(patient.religion)} />
                <PatientDetailItem label="Pendidikan" value={formatValue(patient.education)} />
                <PatientDetailItem label="Pekerjaan" value={formatValue(patient.occupation)} />
              </div>

              <div className="grid gap-x-6 gap-y-4 border border-border/70 bg-muted/[0.03] p-4 md:grid-cols-2">
                <PatientDetailItem label="Alamat Lengkap" value={formatValue(patient.address)} />
                <PatientDetailItem label="RT / RW" value={patient.rt || patient.rw ? `${patient.rt || '-'}/${patient.rw || '-'}` : '-'} />
                <PatientDetailItem label="Kelurahan" value={formatValue(patient.kelurahan)} />
                <PatientDetailItem label="Kecamatan" value={formatValue(patient.kecamatan)} />
                <PatientDetailItem label="Kota / Kabupaten" value={formatValue(patient.city)} />
                <PatientDetailItem label="Provinsi" value={formatValue(patient.province)} />
                <PatientDetailItem label="Kode Pos" value={formatValue(patient.postal_code)} />
                <PatientDetailItem label="Telepon" value={formatValue(patient.phone)} />
                <PatientDetailItem label="Email" value={formatValue(patient.email)} />
              </div>
            </div>
          </PatientSection>

          <PatientSection title="Penjamin Dan Catatan Medis" helper="Penjamin, alergi, dan catatan tambahan ditempatkan dalam satu blok untuk mempercepat verifikasi administratif.">
            <div className="grid gap-x-6 gap-y-4 border border-border/70 bg-muted/[0.03] p-4 md:grid-cols-2 xl:grid-cols-3">
              <PatientDetailItem label="Tipe Asuransi" value={getPatientInsuranceLabel(patient.insurance_type)} />
              {patient.insurance_type !== 'umum' ? <PatientDetailItem label="Nomor Asuransi" value={formatValue(patient.insurance_number)} /> : null}
              <PatientDetailItem label="Kontak Darurat" value={getPatientEmergencyLabel(patient)} />
              <PatientDetailItem label="Alergi" value={formatValue(patient.allergies, 'Tidak ada data alergi')} />
              <PatientDetailItem label="Catatan Tambahan" value={formatValue(patient.notes, 'Tidak ada catatan tambahan')} />
            </div>
          </PatientSection>

          <PatientSection title="Kesiapan SATUSEHAT" helper="Checklist detail dipindahkan ke area utama agar aside tetap pendek dan tidak perlu scroll.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {satusehatChecklist.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 border border-border/70 bg-muted/[0.03] p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground/95">{item.label}</p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{item.hint}</p>
                  </div>
                  <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-none whitespace-nowrap">
                    {item.ready ? 'Siap' : 'Lengkapi'}
                  </Badge>
                </div>
              ))}
            </div>
          </PatientSection>

          <PatientSection title="Metadata Pasien" helper="Informasi sistem dipindahkan ke konten utama agar sidebar tetap ringkas.">
            <div className="grid gap-x-6 gap-y-4 border border-border/70 bg-muted/[0.03] p-4 md:grid-cols-2 xl:grid-cols-3">
              <PatientDetailItem label="Status" value={patient.is_active ? 'Aktif' : 'Nonaktif'} />
              <PatientDetailItem label="Dibuat" value={formatDateTime(patient.created_at)} />
              <PatientDetailItem label="Terakhir Diubah" value={formatDateTime(patient.updated_at)} />
            </div>
          </PatientSection>

          <PatientSection title="Riwayat Kunjungan" helper="Daftar kunjungan ditampilkan dalam satu list terstruktur, bukan kartu per item, agar lebih ringkas saat audit riwayat pasien.">
            {visits.length === 0 ? (
              <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                Belum ada riwayat kunjungan.
              </div>
            ) : (
              <div className="overflow-hidden border border-border/70 bg-background">
                <div className="divide-y divide-border/70">
                  {visits.map((visit) => (
                    <div key={visit.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[180px_220px_minmax(0,1fr)_170px]">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/95">{formatDate(visit.visit_date)}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{visit.visit_number}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/95">{(visit as any).polyclinic?.name || '-'}</p>
                        <p className="text-[11px] text-muted-foreground">{(visit as any).doctor?.full_name || '-'}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Keluhan</p>
                        <p className="text-sm leading-6 text-foreground/95">{formatValue(visit.complaint)}</p>
                      </div>

                      <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                        <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
                          {STATUS_LABEL[visit.status] || visit.status}
                        </Badge>
                        <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
                          {QUEUE_LABEL[visit.queue_status] || visit.queue_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PatientSection>
        </div>
      </PatientPageShell>
    </>
  );
}