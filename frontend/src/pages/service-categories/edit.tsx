import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { serviceCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function ServiceCategoryEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [name, setName] = useState('');

  useEffect(() => {
    setPageTitle('Edit Kategori Layanan');
    serviceCategoriesApi.getById(Number(id)).then(res => setName(res.data.data.name)).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await serviceCategoriesApi.update(Number(id), { name }); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/service-categories'), 500); }
    catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui." }); }
    finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="service-category-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Kategori Layanan"
        subtitle="Perbarui kategori referensi untuk menjaga pengelompokan layanan tetap konsisten."
        onBack={() => navigate('/service-categories')}
        actions={<Button type="submit" form="service-category-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Nama kategori yang akan diperbarui.">
                <p className="truncate font-medium">{name || '-'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5"><div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Kategori</Label><Input id="name" required value={name} onChange={e => setName(e.target.value)} className="h-10 text-sm" /></div></section></div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
