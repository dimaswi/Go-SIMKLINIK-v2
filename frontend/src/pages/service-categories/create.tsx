import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { serviceCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function ServiceCategoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setPageTitle('Tambah Kategori Layanan'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await serviceCategoriesApi.create({ name });
      toast({ variant: "success", title: "Berhasil!", description: "Kategori layanan berhasil dibuat." });
      setTimeout(() => navigate('/service-categories'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat kategori layanan." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="service-category-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Tambah Kategori Layanan"
        subtitle="Kelompokkan tindakan dan tarif medis klinik."
        onBack={() => navigate('/service-categories')}
        actions={
          <Button type="submit" form="service-category-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan Kategori
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Kategori Layanan</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Kategori *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Contoh: Tindakan Medis, Laboratorium, Radiologi"
                  value={name}
                  onChange={e => setName(e.target.value)}
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
