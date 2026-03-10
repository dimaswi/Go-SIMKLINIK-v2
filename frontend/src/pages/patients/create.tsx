import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { patientsApi } from '@/lib/api';
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
  required = false,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <Input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} className="h-10 text-sm" />
    </div>
  );
}

export default function PatientCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nik: '', full_name: '', birth_date: '', birth_place: '', gender: '',
    blood_type: '', marital_status: '', religion: '', education: '', occupation: '',
    address: '', rt: '', rw: '', kelurahan: '', kecamatan: '', city: '', province: '', postal_code: '',
    phone: '', email: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '',
    insurance_type: 'umum', insurance_number: '', allergies: '', notes: '',
  });

  useEffect(() => { setPageTitle('Tambah Pasien'); }, []);

  const set = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.name, e.target.value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.gender) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Nama dan jenis kelamin wajib diisi.' });
      return;
    }
    setLoading(true);
    try {
      const payload = { ...formData, birth_date: formData.birth_date || null };
      const res = await patientsApi.create(payload);
      toast({ variant: 'success', title: 'Berhasil!', description: `Pasien ${formData.full_name} berhasil didaftarkan.` });
      navigate(`/patients/${res.data.data.id}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal mendaftarkan pasien.' });
    } finally {
      setLoading(false);
    }
  };

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
            <PatientFormField label="Nama Lengkap" name="full_name" placeholder="Masukkan nama lengkap" required value={formData.full_name} onChange={handleInput} />
            <PatientFormField label="NIK" name="nik" placeholder="16 digit NIK" value={formData.nik} onChange={handleInput} />
            <PatientFormField label="Tempat Lahir" name="birth_place" placeholder="Kota lahir" value={formData.birth_place} onChange={handleInput} />
            <PatientFormField label="Tanggal Lahir" name="birth_date" type="date" value={formData.birth_date} onChange={handleInput} />
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jenis Kelamin<span className="text-destructive ml-0.5">*</span></Label>
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
            <PatientFormField label="Pendidikan Terakhir" name="education" placeholder="SD/SMP/SMA/D3/S1/..." value={formData.education} onChange={handleInput} />
          </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Alamat</p>
            </div>
            <div className="space-y-2">
            <Label htmlFor="address" className="text-xs font-medium">Alamat Lengkap</Label>
            <Input id="address" name="address" value={formData.address} onChange={handleInput} placeholder="Jl. Contoh No. 1" className="h-10 text-sm" />
          </div>
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
              <div className="space-y-4">
              <PatientFormField label="No. Telepon / HP" name="phone" placeholder="08xxxxxxxxxx" value={formData.phone} onChange={handleInput} />
              <PatientFormField label="Email" name="email" type="email" placeholder="email@contoh.com" value={formData.email} onChange={handleInput} />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Kontak Darurat</p>
            <div className="space-y-4">
              <PatientFormField label="Nama" name="emergency_contact_name" placeholder="Nama kontak darurat" value={formData.emergency_contact_name} onChange={handleInput} />
              <PatientFormField label="No. Telepon" name="emergency_contact_phone" placeholder="08xxxxxxxxxx" value={formData.emergency_contact_phone} onChange={handleInput} />
              <PatientFormField label="Hubungan" name="emergency_contact_relation" placeholder="Suami/Istri/Orang Tua/..." value={formData.emergency_contact_relation} onChange={handleInput} />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="allergies" className="text-xs font-medium">Alergi</Label>
              <Input id="allergies" name="allergies" value={formData.allergies} onChange={handleInput} placeholder="Alergi obat, makanan, dll." className="h-10 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs font-medium">Catatan Tambahan</Label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInput}
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
              <p className="text-muted-foreground">NIK: {formData.nik || '-'}</p>
              <p className="text-muted-foreground">Jenis Kelamin: {GENDER_OPTIONS.find(option => option.value === formData.gender)?.label || '-'}</p>
              <p className="text-muted-foreground">Telepon: {formData.phone || '-'}</p>
              <p className="text-muted-foreground">Asuransi: {INSURANCE_OPTIONS.find(option => option.value === formData.insurance_type)?.label || '-'}</p>
              <p className="pt-2 text-xs text-muted-foreground">No. rekam medis dibuat otomatis setelah pasien disimpan.</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Pasien
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/patients')} className="h-10">
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
