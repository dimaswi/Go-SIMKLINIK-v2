import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { patientsApi, polyclinicsApi, doctorsApi, visitsApi, type Patient, type Polyclinic, type Doctor } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Calendar, Stethoscope, ClipboardList } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

const PAYMENT_OPTIONS = [
  { value: 'umum', label: 'Umum (Mandiri)' },
  { value: 'bpjs', label: 'BPJS Kesehatan' },
  { value: 'asuransi', label: 'Asuransi Swasta' },
];
const VISIT_TYPE_OPTIONS = [
  { value: 'baru', label: 'Pasien Baru' },
  { value: 'lama', label: 'Pasien Lama' },
];
const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent (Prioritas)' },
];

function calcAge(birth: string) {
  return Math.floor((Date.now() - new Date(birth).getTime()) / 31557600000);
}

export default function RegistrationCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    patient_id: searchParams.get('patient_id') || '',
    polyclinic_id: '',
    doctor_id: '',
    visit_date: new Date().toISOString().split('T')[0],
    payment_type: 'umum',
    visit_type: 'baru',
    priority: 'normal',
    complaint: '',
  });

  useEffect(() => {
    setPageTitle('Pendaftaran Kunjungan');
    Promise.all([
      patientsApi.getAll('per_page=500&is_active=true'),
      polyclinicsApi.getAll(),
      doctorsApi.getAll(),
    ]).then(([patientRes, poliRes, doctorRes]) => {
      const patientList = patientRes.data.data || [];
      const doctorList = doctorRes.data.data || [];
      setPatients(patientList);
      setPolyclinics(poliRes.data.data || []);
      setAllDoctors(doctorList);

      const pid = searchParams.get('patient_id');
      if (pid) {
        const patient = patientList.find((item: Patient) => String(item.id) === pid);
        if (patient) {
          setSelectedPatient(patient);
          setFormData(prev => ({
            ...prev,
            patient_id: pid,
            visit_type: 'lama',
            payment_type: patient.insurance_type || 'umum',
          }));
        }
      }
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pendaftaran.' });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!formData.patient_id) {
      setSelectedPatient(null);
      return;
    }
    const patient = patients.find(item => String(item.id) === formData.patient_id) || null;
    setSelectedPatient(patient);
    if (patient) {
      setFormData(prev => ({
        ...prev,
        visit_type: 'lama',
        payment_type: patient.insurance_type || prev.payment_type || 'umum',
      }));
    }
  }, [formData.patient_id, patients]);

  useEffect(() => {
    if (formData.polyclinic_id) {
      const filtered = allDoctors.filter(d =>
        !d.polyclinics || d.polyclinics.length === 0 ||
        d.polyclinics.some((p: any) => String(p.id) === formData.polyclinic_id)
      );
      setDoctors(filtered.length > 0 ? filtered : allDoctors);
    } else {
      setDoctors(allDoctors);
    }
    setFormData(f => ({ ...f, doctor_id: '' }));
  }, [formData.polyclinic_id, allDoctors]);

  const set = (field: string, val: string) => setFormData(p => ({ ...p, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient_id || !selectedPatient || !formData.polyclinic_id) {
      toast({ variant: 'destructive', title: 'Periksa data!', description: 'Pasien dan poliklinik wajib diisi.' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        patient_id: Number(formData.patient_id),
        polyclinic_id: Number(formData.polyclinic_id),
        doctor_id: formData.doctor_id ? Number(formData.doctor_id) : null,
      };
      await visitsApi.create(payload);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Kunjungan berhasil didaftarkan.' });
      navigate('/registration');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal!', description: e.response?.data?.error || 'Pendaftaran gagal.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const patientOptions = patients.map(patient => ({
    value: String(patient.id),
    label: `${patient.medical_record_number} - ${patient.full_name}`,
  }));
  const polyOptions = polyclinics.map(p => ({ value: String(p.id), label: p.name }));
  const doctorOptions = doctors.map(d => ({ value: String(d.id), label: `${d.full_name}${d.specialization ? ` — ${d.specialization}` : ''}` }));

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Pasien</p>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Pilih Pasien</Label>
                <SearchableSelect
                  options={patientOptions}
                  value={formData.patient_id}
                  onValueChange={value => set('patient_id', value)}
                  placeholder="Cari pasien berdasarkan No. RM atau nama..."
                  searchPlaceholder="Cari pasien..."
                  emptyText="Pasien tidak ditemukan."
                />
              </div>
              <Button type="button" variant="outline" className="h-10" onClick={() => navigate('/patients/create')}>
                + Tambah Pasien
              </Button>
            </div>
            {selectedPatient && (
              <div className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{selectedPatient.full_name}</p>
                  <span className="font-mono text-xs text-muted-foreground">{selectedPatient.medical_record_number}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{selectedPatient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                  {selectedPatient.birth_date && <span>{calcAge(selectedPatient.birth_date)} tahun</span>}
                  <span>{selectedPatient.phone || 'Tanpa telepon'}</span>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Data Kunjungan</p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Poliklinik <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  options={polyOptions}
                  value={formData.polyclinic_id}
                  onValueChange={v => set('polyclinic_id', v)}
                  placeholder="Pilih poliklinik..."
                  searchPlaceholder="Cari poli..."
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Dokter</Label>
                <SearchableSelect
                  options={doctorOptions}
                  value={formData.doctor_id}
                  onValueChange={v => set('doctor_id', v)}
                  placeholder="Pilih dokter..."
                  searchPlaceholder="Cari dokter..."
                  noneLabel="Belum ditentukan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="visit_date" className="text-xs font-medium">Tanggal Kunjungan</Label>
                <Input id="visit_date" type="date" value={formData.visit_date} onChange={e => set('visit_date', e.target.value)} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Pembayaran</Label>
                <SearchableSelect options={PAYMENT_OPTIONS} value={formData.payment_type} onValueChange={v => set('payment_type', v)} placeholder="Pilih pembayaran..." />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tipe Kunjungan</Label>
                <SearchableSelect options={VISIT_TYPE_OPTIONS} value={formData.visit_type} onValueChange={v => set('visit_type', v)} placeholder="Pilih tipe..." />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Prioritas</Label>
                <SearchableSelect options={PRIORITY_OPTIONS} value={formData.priority} onValueChange={v => set('priority', v)} placeholder="Pilih prioritas..." />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Keluhan</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="complaint" className="text-xs font-medium">Keluhan Utama</Label>
              <textarea
                id="complaint"
                value={formData.complaint}
                onChange={e => set('complaint', e.target.value)}
                placeholder="Keluhan yang disampaikan pasien..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan Pendaftaran</p>
            <div className="space-y-1">
              <p className="truncate font-medium">{selectedPatient?.full_name || 'Pasien belum dipilih'}</p>
              <p className="font-mono text-muted-foreground">{selectedPatient?.medical_record_number || '-'}</p>
              <p className="text-muted-foreground">Poli: {polyclinics.find(item => String(item.id) === formData.polyclinic_id)?.name || '-'}</p>
              <p className="text-muted-foreground">Dokter: {doctors.find(item => String(item.id) === formData.doctor_id)?.full_name || 'Belum ditentukan'}</p>
              <p className="text-muted-foreground">Tanggal: {formData.visit_date || '-'}</p>
              <p className="text-muted-foreground">Pembayaran: {PAYMENT_OPTIONS.find(option => option.value === formData.payment_type)?.label || '-'}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Catatan
            </p>
            <p className="text-muted-foreground">Nomor kunjungan dan nomor antrian akan dibuat otomatis saat data disimpan.</p>
          </div>

          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={submitting} className="h-10">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Pendaftaran
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/registration')} className="h-10">
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
