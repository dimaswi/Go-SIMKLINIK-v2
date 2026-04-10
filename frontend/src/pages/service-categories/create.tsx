import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { serviceCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function ServiceCategoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setPageTitle('Tambah Kategori Layanan'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await serviceCategoriesApi.create({ name }); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/service-categories'), 400); }
    catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat." }); }
    finally { setLoading(false); }
  };

  return (
    <form id="service-category-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Kategori Layanan"
        subtitle="Kelompokkan layanan medis ke kategori referensi agar pengelolaan tindakan lebih terstruktur."
        onBack={() => navigate('/service-categories')}
        actions={<Button type="submit" form="service-category-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Kategori baru yang akan ditambahkan.">
                <p className="truncate font-medium">{name || 'Nama belum diisi'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5"><div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Kategori</Label><Input id="name" required placeholder="Contoh: Tindakan Medis" value={name} onChange={e => setName(e.target.value)} className="h-10 text-sm" /></div></section></div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
