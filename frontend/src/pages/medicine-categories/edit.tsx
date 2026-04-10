import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { medicineCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function MedicineCategoryEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    setPageTitle('Edit Kategori Obat');
    medicineCategoriesApi.getById(Number(id)).then(res => {
      const d = res.data.data;
      setFormData({ name: d.name, description: d.description });
    }).catch(() => toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." }))
    .finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await medicineCategoriesApi.update(Number(id), formData);
      toast({ variant: "success", title: "Berhasil!", description: "Kategori berhasil diperbarui." });
      setTimeout(() => navigate('/medicine-categories'), 500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui." });
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="medicine-category-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Kategori Obat"
        subtitle="Perbarui pengelompokan obat tanpa mengubah relasi data yang sudah dipakai modul lain."
        onBack={() => navigate('/medicine-categories')}
        actions={<Button type="submit" form="medicine-category-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Nama kategori yang akan disimpan.">
                <p className="truncate font-medium">{formData.name || '-'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium">Nama Kategori</Label>
                <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                <Input id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
