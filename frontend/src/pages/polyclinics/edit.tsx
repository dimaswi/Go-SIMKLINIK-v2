import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BpjsReferencePicker } from "@/components/bpjs-reference-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBpjsAntreanEnabled } from "@/hooks/use-bpjs-antrean-enabled";
import { polyclinicsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { setPageTitle } from "@/lib/page-title";
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function PolyclinicEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const { bpjsAntreanEnabled } = useBpjsAntreanEnabled();
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    admin_fee: 0,
    is_active: true,
    color: "#3B82F6",
    icon: "",
    sort_order: 0,
    bpjs_poli_code: "",
  });

  useEffect(() => {
    setPageTitle("Edit Poliklinik");
    if (id) {
      polyclinicsApi.getById(Number(id))
        .then((response) => {
          const data = response.data.data;
          setFormData({
            name: data.name || "",
            code: data.code || "",
            description: data.description || "",
            admin_fee: data.admin_fee || 0,
            is_active: data.is_active ?? true,
            color: data.color || "#3B82F6",
            icon: data.icon || "",
            sort_order: data.sort_order || 0,
            bpjs_poli_code: data.bpjs_poli_code || "",
          });
        })
        .catch((error) => {
          toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data poliklinik." });
        })
        .finally(() => setFetching(false));
    }
  }, [id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await polyclinicsApi.update(Number(id), {
        ...formData,
        admin_fee: Number(formData.admin_fee),
        sort_order: Number(formData.sort_order),
      });
      toast({ variant: "success", title: "Berhasil!", description: "Poliklinik berhasil diperbarui." });
      setTimeout(() => navigate("/polyclinics"), 400);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memperbarui poliklinik." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form id="polyclinic-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Poliklinik"
        subtitle="Perbarui detail poliklinik."
        onBack={() => navigate('/polyclinics')}
        actions={
          <Button type="submit" form="polyclinic-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Poliklinik
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detail Poliklinik</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Kode Poliklinik</Label>
                <Input
                  value={formData.code}
                  readOnly
                  className="h-9 text-xs bg-muted/40 text-muted-foreground font-mono rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Poliklinik *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="admin_fee" className="text-xs font-medium">Biaya Administrasi (Rp)</Label>
                <Input
                  id="admin_fee"
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.admin_fee}
                  onChange={e => setFormData({ ...formData, admin_fee: Number(e.target.value) })}
                  className="h-9 text-xs font-mono rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sort_order" className="text-xs font-medium">Urutan Tampilan</Label>
                <Input
                  id="sort_order"
                  type="number"
                  min="0"
                  value={formData.sort_order}
                  onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="h-9 text-xs font-mono rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                <Input
                  id="description"
                  placeholder="Deskripsi poliklinik"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="color" className="text-xs font-medium">Warna Label</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="h-9 w-10 border border-border/70 cursor-pointer shrink-0 p-0.5 bg-background rounded-none"
                  />
                  <Input
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="h-9 text-xs font-mono flex-1 rounded-none uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="icon" className="text-xs font-medium">Icon (Opsional)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={e => setFormData({ ...formData, icon: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            {bpjsAntreanEnabled ? (
              <div className="space-y-1 pt-1">
                <Label htmlFor="bpjs_poli_code" className="text-xs font-medium">Kode Poli BPJS</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    id="bpjs_poli_code"
                    value={formData.bpjs_poli_code}
                    onChange={e => setFormData({ ...formData, bpjs_poli_code: e.target.value })}
                    className="h-9 text-xs font-mono rounded-none"
                  />
                  <BpjsReferencePicker
                    type="poli"
                    value={formData.bpjs_poli_code}
                    onValueChange={(value) => setFormData({ ...formData, bpjs_poli_code: value })}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : null}

            <div className="pt-1">
              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                  <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Poliklinik aktif dan dapat dipilih di pendaftaran' : 'Poliklinik dinonaktifkan'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
