import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { patientsApi, type Patient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

const GENDER_OPTIONS = [{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }];
const BLOOD_TYPES = ['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }));
const MARITAL_OPTIONS = [
  { value: 'belum_menikah', label: 'Belum Menikah' },
  { value: 'menikah', label: 'Menikah' },
  { value: 'cerai_hidup', label: 'Cerai Hidup' },
  { value: 'cerai_mati', label: 'Cerai Mati' },
];
const RELIGION_OPTIONS = [
  { value: 'islam', label: 'Islam' },
  { value: 'kristen', label: 'Kristen' },
  { value: 'katolik', label: 'Katolik' },
  { value: 'hindu', label: 'Hindu' },
  { value: 'buddha', label: 'Buddha' },
  { value: 'konghucu', label: 'Konghucu' },
];
const INSURANCE_OPTIONS = [
  { value: 'umum', label: 'Umum (Mandiri)' },
  { value: 'bpjs', label: 'BPJS Kesehatan' },
  { value: 'asuransi', label: 'Asuransi Swasta' },
];

function PatientFormField({
  label,
  name,
  type = 'text',
  placeholder = '',
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-xs font-medium">{label}</Label>
      <Input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} className="h-10 text-sm" />
    </div>
  );
}

export default function PatientEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [mrn, setMrn] = useState('');
  const [formData, setFormData] = useState({
    nik: '', full_name: '', birth_date: '', birth_place: '', gender: '',
    blood_type: '', marital_status: '', religion: '', education: '', occupation: '',
    address: '', rt: '', rw: '', kelurahan: '', kecamatan: '', city: '', province: '', postal_code: '',
    phone: '', email: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '',
    insurance_type: 'umum', insurance_number: '', allergies: '', notes: '',
  });

  useEffect(() => {
    setPageTitle('Edit Pasien');
    patientsApi.getById(Number(id)).then(res => {
      const p: Patient = res.data.data;
      setMrn(p.medical_record_number);
      setFormData({
        nik: p.nik || '',
        full_name: p.full_name,
        birth_date: p.birth_date ? p.birth_date.split('T')[0] : '',
        birth_place: p.birth_place || '',
        gender: p.gender,
        blood_type: p.blood_type || '',
        marital_status: p.marital_status || '',
        religion: p.religion || '',
        education: p.education || '',
        occupation: p.occupation || '',
        address: p.address || '',
        rt: p.rt || '', rw: p.rw || '',
        kelurahan: p.kelurahan || '', kecamatan: p.kecamatan || '',
        city: p.city || '', province: p.province || '', postal_code: p.postal_code || '',
        phone: p.phone || '', email: p.email || '',
        emergency_contact_name: p.emergency_contact_name || '',
        emergency_contact_phone: p.emergency_contact_phone || '',
        emergency_contact_relation: p.emergency_contact_relation || '',
        insurance_type: p.insurance_type || 'umum',
        insurance_number: p.insurance_number || '',
        allergies: p.allergies || '',
        notes: p.notes || '',
      });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pasien.' });
    }).finally(() => setFetching(false));
  }, [id]);

  const set = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.name, e.target.value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await patientsApi.update(Number(id), { ...formData, birth_date: formData.birth_date || null });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Data pasien berhasil diperbarui.' });
      navigate(`/patients/${id}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal memperbarui data.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Identitas Pasien</p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <PatientFormField label="Nama Lengkap" name="full_name" placeholder="Nama lengkap" value={formData.full_name} onChange={handleInput} />
            <PatientFormField label="NIK" name="nik" placeholder="16 digit NIK" value={formData.nik} onChange={handleInput} />
            <PatientFormField label="Tempat Lahir" name="birth_place" placeholder="Kota lahir" value={formData.birth_place} onChange={handleInput} />
            <PatientFormField label="Tanggal Lahir" name="birth_date" type="date" value={formData.birth_date} onChange={handleInput} />
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jenis Kelamin</Label>
              <SearchableSelect options={GENDER_OPTIONS} value={formData.gender} onValueChange={v => set('gender', v)} placeholder="Pilih JK..." />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Golongan Darah</Label>
              <SearchableSelect options={BLOOD_TYPES} value={formData.blood_type} onValueChange={v => set('blood_type', v)} placeholder="Pilih gol. darah..." noneLabel="Tidak diketahui" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Status Pernikahan</Label>
              <SearchableSelect options={MARITAL_OPTIONS} value={formData.marital_status} onValueChange={v => set('marital_status', v)} placeholder="Pilih status..." noneLabel="Pilih status" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Agama</Label>
              <SearchableSelect options={RELIGION_OPTIONS} value={formData.religion} onValueChange={v => set('religion', v)} placeholder="Pilih agama..." noneLabel="Pilih agama" />
            </div>
            <PatientFormField label="Pekerjaan" name="occupation" placeholder="Pekerjaan" value={formData.occupation} onChange={handleInput} />
            <PatientFormField label="Pendidikan Terakhir" name="education" placeholder="SD/SMP/SMA/..." value={formData.education} onChange={handleInput} />
          </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Alamat</p>
            </div>
          <PatientFormField label="Alamat Lengkap" name="address" placeholder="Jl. Contoh No. 1" value={formData.address} onChange={handleInput} />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <PatientFormField label="RT" name="rt" placeholder="001" value={formData.rt} onChange={handleInput} />
            <PatientFormField label="RW" name="rw" placeholder="001" value={formData.rw} onChange={handleInput} />
            <PatientFormField label="Kelurahan" name="kelurahan" placeholder="Kelurahan" value={formData.kelurahan} onChange={handleInput} />
            <PatientFormField label="Kecamatan" name="kecamatan" placeholder="Kecamatan" value={formData.kecamatan} onChange={handleInput} />
            <PatientFormField label="Kota/Kabupaten" name="city" placeholder="Kota" value={formData.city} onChange={handleInput} />
            <PatientFormField label="Provinsi" name="province" placeholder="Provinsi" value={formData.province} onChange={handleInput} />
            <PatientFormField label="Kode Pos" name="postal_code" placeholder="12345" value={formData.postal_code} onChange={handleInput} />
          </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Kontak</p>
              </div>
            <PatientFormField label="No. Telepon / HP" name="phone" placeholder="08xxxxxxxxxx" value={formData.phone} onChange={handleInput} />
            <PatientFormField label="Email" name="email" type="email" placeholder="email@contoh.com" value={formData.email} onChange={handleInput} />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Kontak Darurat</p>
            <PatientFormField label="Nama" name="emergency_contact_name" placeholder="Nama kontak darurat" value={formData.emergency_contact_name} onChange={handleInput} />
            <PatientFormField label="No. Telepon" name="emergency_contact_phone" placeholder="08xxxxxxxxxx" value={formData.emergency_contact_phone} onChange={handleInput} />
            <PatientFormField label="Hubungan" name="emergency_contact_relation" placeholder="Suami/Istri/Orang Tua/..." value={formData.emergency_contact_relation} onChange={handleInput} />
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Asuransi & Catatan Medis</p>
              </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Tipe Asuransi</Label>
              <SearchableSelect options={INSURANCE_OPTIONS} value={formData.insurance_type} onValueChange={v => set('insurance_type', v)} placeholder="Pilih tipe..." />
            </div>
            {formData.insurance_type !== 'umum' && (
              <PatientFormField label="No. Asuransi / BPJS" name="insurance_number" placeholder="Nomor kartu asuransi" value={formData.insurance_number} onChange={handleInput} />
            )}
            <PatientFormField label="Alergi" name="allergies" placeholder="Alergi obat, makanan, dll." value={formData.allergies} onChange={handleInput} />
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs font-medium">Catatan Tambahan</Label>
              <textarea
                id="notes" name="notes" value={formData.notes} onChange={handleInput}
                placeholder="Catatan medis atau informasi penting lainnya..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan Pasien</p>
            <div className="space-y-1">
              <p className="truncate font-medium">{formData.full_name || 'Nama belum diisi'}</p>
              <p className="font-mono text-muted-foreground">{mrn || 'No. RM belum tersedia'}</p>
              <p className="text-muted-foreground">Jenis Kelamin: {GENDER_OPTIONS.find(option => option.value === formData.gender)?.label || '-'}</p>
              <p className="text-muted-foreground">Telepon: {formData.phone || '-'}</p>
              <p className="text-muted-foreground">Asuransi: {INSURANCE_OPTIONS.find(option => option.value === formData.insurance_type)?.label || '-'}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Pasien
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/patients/${id}`)} className="h-10">
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
