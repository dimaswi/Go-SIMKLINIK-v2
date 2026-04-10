import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { polyclinicsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Palette } from "lucide-react";
import { setPageTitle } from "@/lib/page-title";
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

export default function PolyclinicCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    admin_fee: 0,
    is_active: true,
    color: "#3B82F6",
    icon: "",
    sort_order: 0,
  });

  useEffect(() => {
    setPageTitle("Tambah Poliklinik");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await polyclinicsApi.create({
        ...formData,
        admin_fee: Number(formData.admin_fee),
        sort_order: Number(formData.sort_order),
      });
      toast({ variant: "success", title: "Berhasil!", description: "Poliklinik berhasil dibuat." });
      setTimeout(() => navigate("/polyclinics"), 400);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal membuat poliklinik." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="polyclinic-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Poliklinik"
        subtitle="Atur unit poliklinik yang dipakai pada pendaftaran, EMR, dan penjadwalan dokter."
        onBack={() => navigate('/polyclinics')}
        actions={<Button type="submit" form="polyclinic-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Poliklinik</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview unit poliklinik sebelum disimpan.">
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><div className="h-4 w-4 rounded" style={{ backgroundColor: formData.color || '#6B7280' }} /><p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p></div>
                  <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
                  <p className="text-muted-foreground">Admin: {formatCurrency(Number(formData.admin_fee) || 0)}</p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />Nama Poliklinik</Label>
                <Input id="name" required placeholder="Contoh: Poli Umum" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                <Input id="description" placeholder="Deskripsi poliklinik" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="admin_fee" className="text-xs font-medium">Biaya Administrasi</Label>
                  <Input id="admin_fee" type="number" min="0" step="1000" value={formData.admin_fee} onChange={e => setFormData({ ...formData, admin_fee: Number(e.target.value) })} className="h-10 text-sm" />
                  <p className="text-xs text-muted-foreground">Invoice otomatis dibuat saat pendaftaran menggunakan tarif ini.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color" className="text-xs font-medium flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-muted-foreground" />Warna</Label>
                  <div className="flex gap-2">
                    <input type="color" id="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" />
                    <Input value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-10 text-sm flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon" className="text-xs font-medium">Icon</Label>
                  <Input id="icon" placeholder="Contoh: stethoscope" value={formData.icon} onChange={e => setFormData({ ...formData, icon: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort_order" className="text-xs font-medium">Urutan</Label>
                  <Input id="sort_order" type="number" min="0" value={formData.sort_order} onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })} className="h-10 text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                  <p className="text-xs text-muted-foreground">{formData.is_active ? 'Poliklinik aktif' : 'Poliklinik tidak aktif'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
