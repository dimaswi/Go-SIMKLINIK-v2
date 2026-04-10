import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { patientsApi, type Patient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import {
  EMPTY_PATIENT_FORM_DATA,
  PatientFormSections,
  PatientFormSummaryPanel,
  PatientPageShell,
  type PatientFormData,
  getPatientGenderLabel,
  getPatientInsuranceLabel,
  isPatientSatusehatReady,
  mapPatientToFormData,
} from './shared';

export default function PatientEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [mrn, setMrn] = useState('');
  const [formData, setFormData] = useState<PatientFormData>(EMPTY_PATIENT_FORM_DATA);
  const satusehatReady = isPatientSatusehatReady(formData);

  useEffect(() => {
    setPageTitle('Edit Pasien');
    patientsApi.getById(Number(id)).then((detailResponse) => {
      const patient: Patient = detailResponse.data.data;
      setMrn(patient.medical_record_number);
      setFormData(mapPatientToFormData(patient));
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pasien.' });
    }).finally(() => setFetching(false));
  }, [id, toast]);

  const setField = (field: keyof PatientFormData, value: string) => setFormData((previous) => ({ ...previous, [field]: value }));
  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => setField(event.target.name as keyof PatientFormData, event.target.value);
  const handleTextarea = (event: React.ChangeEvent<HTMLTextAreaElement>) => setField(event.target.name as keyof PatientFormData, event.target.value);

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

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="patient-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PatientPageShell
        title={formData.full_name || 'Edit Pasien'}
        subtitle="Perbarui data administratif pasien dengan pola layout yang sama seperti workspace rekam medis terbaru. Nomor rekam medis tetap dipertahankan."
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
        meta={
          <>
            <span>{getPatientGenderLabel(formData.gender)}</span>
            <span>Telepon {formData.phone || '-'}</span>
            <span>NIK {formData.nik || '-'}</span>
          </>
        }
        actions={
          <Button type="submit" form="patient-edit-form" className="gap-1.5 rounded-none shadow-none" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {loading ? 'Menyimpan...' : 'Update Pasien'}
          </Button>
        }
        aside={
          <PatientFormSummaryPanel
            formData={formData}
            medicalRecordNumber={mrn}
            footerNote="Perubahan pada data ini langsung memengaruhi registrasi ulang dan kesiapan payload Patient SATUSEHAT untuk sinkronisasi berikutnya."
          />
        }
      >
        <div className="divide-y divide-border/70">
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
