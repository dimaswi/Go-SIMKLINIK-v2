import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { medicineCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function MedicineCategoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => { setPageTitle('Tambah Kategori Obat'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await medicineCategoriesApi.create(formData);
      toast({ variant: "success", title: "Berhasil!", description: "Kategori berhasil dibuat." });
      setTimeout(() => navigate('/medicine-categories'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat kategori." });
    } finally { setLoading(false); }
  };

  return (
    <form id="medicine-category-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Kategori Obat"
        subtitle="Kelompokkan obat ke kategori referensi agar pencarian dan pelaporan stok lebih rapi."
        onBack={() => navigate('/medicine-categories')}
        actions={<Button type="submit" form="medicine-category-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview nama kategori yang akan ditambahkan.">
                <p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p>
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
                <Input id="name" required placeholder="Contoh: Antibiotik" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                <Input id="description" placeholder="Deskripsi kategori" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
