import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  mapPatientToFormData,
} from './shared';

export default function PatientEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState<PatientFormData>(EMPTY_PATIENT_FORM_DATA);
  const [mrn, setMrn] = useState('');
  const satusehatReady = isPatientSatusehatReady(formData);

  useEffect(() => {
    setPageTitle('Edit Pasien');
    if (!id) return;
    patientsApi
      .getById(Number(id))
      .then((res) => {
        const p = res.data.data;
        setFormData(mapPatientToFormData(p));
        setMrn(p.medical_record_number || '');
      })
      .catch((e) => {
        toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal memuat data.' });
        navigate('/patients');
      })
      .finally(() => setFetching(false));
  }, [id]);

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
      await patientsApi.update(Number(id), { ...formData, birth_date: formData.birth_date || null });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Data pasien berhasil diperbarui.' });
      navigate(`/patients/${id}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal memperbarui data.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form id="patient-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <PatientPageShell
        title={formData.full_name || 'Edit Pasien'}
        subtitle="Perbarui data administratif dan kontak pasien."
        onBack={() => navigate(`/patients/${id}`)}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">Edit Pasien</Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none">{mrn || 'No. RM'}</Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none">{getPatientInsuranceLabel(formData.insurance_type)}</Badge>
            <Badge className={satusehatReady ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {satusehatReady ? 'Siap SATUSEHAT' : 'Perlu Lengkapi'}
            </Badge>
          </>
        }
        actions={
          <Button type="submit" form="patient-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Pasien
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
