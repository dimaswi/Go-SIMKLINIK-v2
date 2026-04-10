import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { unitsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function UnitEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [name, setName] = useState('');

  useEffect(() => {
    setPageTitle('Edit Satuan');
    unitsApi.getById(Number(id)).then(res => setName(res.data.data.name)).catch(() => toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await unitsApi.update(Number(id), { name });
      toast({ variant: "success", title: "Berhasil!", description: "Satuan berhasil diperbarui." });
      setTimeout(() => navigate('/units'), 500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui." });
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="unit-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Satuan"
        subtitle="Perbarui satuan referensi yang dipakai pada item master lain tanpa mengubah struktur datanya."
        onBack={() => navigate('/units')}
        actions={<Button type="submit" form="unit-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Nilai terbaru yang akan disimpan.">
                <p className="truncate font-medium">{name || '-'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium">Nama Satuan</Label>
                <Input id="name" required value={name} onChange={e => setName(e.target.value)} className="h-10 text-sm" />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
