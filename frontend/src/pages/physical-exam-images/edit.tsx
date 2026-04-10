import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { physicalExamImagesApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  buildPhysicalExamImageFormData,
  EMPTY_PHYSICAL_EXAM_IMAGE_FORM,
  PhysicalExamImageForm,
  type PhysicalExamImageFormData,
} from './form';

export default function PhysicalExamImagesEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState<PhysicalExamImageFormData>(EMPTY_PHYSICAL_EXAM_IMAGE_FORM);

  useEffect(() => {
    setPageTitle('Edit Template Gambar Pemeriksaan Fisik');

    const loadData = async () => {
      try {
        const response = await physicalExamImagesApi.getById(Number(id));
        const item = response.data.data;
        setFormData({
          name: item.name,
          category: item.category,
          location: item.location || '',
          description: item.description || '',
          sortOrder: String(item.sort_order ?? 0),
          isActive: item.is_active,
          file: null,
          imageUrl: item.image_url,
        });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error!',
          description: error.response?.data?.error || 'Gagal memuat template gambar.',
        });
        navigate('/physical-exam-images');
      } finally {
        setFetching(false);
      }
    };

    void loadData();
  }, [id, navigate, toast]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      await physicalExamImagesApi.update(Number(id), buildPhysicalExamImageFormData(formData));
      toast({ variant: 'success', title: 'Berhasil!' });
      navigate('/physical-exam-images');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal memperbarui template gambar.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PhysicalExamImageForm
      title="Edit Template Gambar"
      description="Perbarui data template gambar. File gambar bisa dibiarkan kosong jika tidak ingin diganti."
      submitLabel="Update"
      loading={loading}
      mode="edit"
      formData={formData}
      setFormData={setFormData}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/physical-exam-images')}
    />
  );
}