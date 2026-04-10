import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { physicalExamImagesApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  buildPhysicalExamImageFormData,
  EMPTY_PHYSICAL_EXAM_IMAGE_FORM,
  PhysicalExamImageForm,
  type PhysicalExamImageFormData,
} from './form';

export default function PhysicalExamImagesCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<PhysicalExamImageFormData>(EMPTY_PHYSICAL_EXAM_IMAGE_FORM);

  useEffect(() => {
    setPageTitle('Tambah Template Gambar Pemeriksaan Fisik');
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.file) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: 'File gambar wajib dipilih.',
      });
      return;
    }

    setLoading(true);
    try {
      await physicalExamImagesApi.create(buildPhysicalExamImageFormData(formData));
      toast({ variant: 'success', title: 'Berhasil!' });
      navigate('/physical-exam-images');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal menyimpan template gambar.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhysicalExamImageForm
      title="Tambah Template Gambar"
      description="Template gambar ini akan tersedia pada pemeriksaan fisik dan bisa dipilih lebih dari satu gambar dalam satu entri EMR."
      submitLabel="Simpan"
      loading={loading}
      mode="create"
      formData={formData}
      setFormData={setFormData}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/physical-exam-images')}
    />
  );
}