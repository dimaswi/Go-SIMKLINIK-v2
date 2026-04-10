import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { unitsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function UnitCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setPageTitle('Tambah Satuan'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await unitsApi.create({ name });
      toast({ variant: "success", title: "Berhasil!", description: "Satuan berhasil dibuat." });
      setTimeout(() => navigate('/units'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat satuan." });
    } finally { setLoading(false); }
  };

  return (
    <form id="unit-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Satuan"
        subtitle="Atur data referensi satuan yang dipakai pada obat, stok, dan layanan klinik."
        onBack={() => navigate('/units')}
        actions={<Button type="submit" form="unit-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview singkat nilai yang akan disimpan.">
                <p className="truncate font-medium">{name || 'Nama belum diisi'}</p>
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
                <Input id="name" required placeholder="Contoh: Tablet, Botol, Strip" value={name} onChange={e => setName(e.target.value)} className="h-10 text-sm" />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
