import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { patientsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import {
  EMPTY_PATIENT_FORM_DATA,
  PatientFormSections,
  PatientPageShell,
  type PatientFormData,
  getPatientInsuranceLabel,
  isPatientSatusehatReady,
} from './shared';

export default function PatientCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<PatientFormData>(EMPTY_PATIENT_FORM_DATA);
  const satusehatReady = isPatientSatusehatReady(formData);

  useEffect(() => {
    setPageTitle('Tambah Pasien');
  }, []);

  const setField = (field: keyof PatientFormData, value: string) =>
    setFormData((previous) => ({ ...previous, [field]: value }));
  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) =>
    setField(event.target.name as keyof PatientFormData, event.target.value);
  const handleTextarea = (event: React.ChangeEvent<HTMLTextAreaElement>) =>
    setField(event.target.name as keyof PatientFormData, event.target.value);

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
    <form id="patient-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <PatientPageShell
        title="Tambah Pasien"
        subtitle="Identitas, domisili, kontak, dan penjamin pasien."
        onBack={() => navigate('/patients')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">Pasien Baru</Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none">{getPatientInsuranceLabel(formData.insurance_type)}</Badge>
            <Badge className={satusehatReady ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {satusehatReady ? 'Siap SATUSEHAT' : 'Draft Identitas'}
            </Badge>
          </>
        }
        actions={
          <Button type="submit" form="patient-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan Pasien
          </Button>
        }
      >
        <div className="space-y-4">
          <PatientFormSections
            formData={formData}
            setField={setField}
            onInputChange={handleInput}
            onTextareaChange={handleTextarea}
          />
        </div>
      </PatientPageShell>
    </form>
  );
}
