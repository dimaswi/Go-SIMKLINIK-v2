import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { unitsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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
      setTimeout(() => navigate('/units'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui satuan." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="unit-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Satuan"
        subtitle="Perbarui nama satuan ukuran obat / alkes."
        onBack={() => navigate('/units')}
        actions={
          <Button type="submit" form="unit-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Satuan
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Satuan</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Satuan *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Nama satuan"
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
