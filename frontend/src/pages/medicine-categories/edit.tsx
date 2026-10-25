import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { medicineCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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
      setTimeout(() => navigate('/medicine-categories'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui kategori." });
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="medicine-category-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Kategori Obat"
        subtitle="Perbarui data kategori obat farmasi."
        onBack={() => navigate('/medicine-categories')}
        actions={
          <Button type="submit" form="medicine-category-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Kategori
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Kategori</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Kategori *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Nama kategori"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                <Input
                  id="description"
                  placeholder="Keterangan kategori"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
