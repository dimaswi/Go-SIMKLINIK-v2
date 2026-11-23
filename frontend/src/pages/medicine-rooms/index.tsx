import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { medicineRoomsApi, type MedicineRoom } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { Warehouse, Plus, Eye, Edit, Trash2, Loader2, RefreshCw, ArrowUpDown } from 'lucide-react';

const ROOM_TYPE_OPTIONS = [
  { value: 'poliklinik', label: 'Poliklinik' },
  { value: 'depo', label: 'Depo Farmasi' },
  { value: 'apotek', label: 'Ruangan Apotek' },
  { value: 'radiologi', label: 'Radiologi' },
  { value: 'laboratorium', label: 'Laboratorium' },
  { value: 'lainnya', label: 'Ruang Lainnya' },
];

const ROOM_TYPE_LABEL: Record<string, string> = {
  poliklinik: 'Poliklinik',
  depo: 'Depo Farmasi',
  apotek: 'Ruangan Apotek',
  radiologi: 'Radiologi',
  laboratorium: 'Laboratorium',
  lainnya: 'Ruang Lainnya',
  unit: 'Unit / Ruangan',
};

export default function MedicineRoomsIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();

  const [rooms, setRooms] = useState<MedicineRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRoom, setEditingRoom] = useState<MedicineRoom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicineRoom | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'lainnya',
    description: '',
    is_active: true,
  });

  const canCreate = hasPermission('medicine_rooms.create') || hasPermission('polyclinics.create');
  const canUpdate = hasPermission('medicine_rooms.update') || hasPermission('polyclinics.update');
  const canDelete = hasPermission('medicine_rooms.delete') || hasPermission('polyclinics.delete');

  const loadRooms = useCallback(async () => {
    try {
      const res = await medicineRoomsApi.getAll();
      setRooms(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal memuat daftar ruangan.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Stok Ruangan / Depo');
    void loadRooms();
  }, [loadRooms]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const openCreateDialog = () => {
    setEditingRoom(null);
    setFormData({ code: '', name: '', type: 'lainnya', description: '', is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = useCallback((room: MedicineRoom) => {
    setEditingRoom(room);
    setFormData({
      code: room.code,
      name: room.name,
      type: room.room_type || room.type || 'lainnya',
      description: room.description || '',
      is_active: room.is_active,
    });
    setDialogOpen(true);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Kode dan nama ruangan wajib diisi.' });
      return;
    }

    setSaving(true);
    try {
      if (editingRoom) {
        await medicineRoomsApi.update(editingRoom.id, {
          ...formData,
          is_default_depo: editingRoom.is_default_depo,
          is_default_apotek: editingRoom.is_default_apotek,
        });
        toast({ variant: 'success', title: 'Berhasil', description: 'Ruangan berhasil diperbarui.' });
      } else {
        await medicineRoomsApi.create(formData);
        toast({ variant: 'success', title: 'Berhasil', description: 'Ruangan berhasil ditambahkan.' });
      }
      setDialogOpen(false);
      void loadRooms();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal menyimpan ruangan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await medicineRoomsApi.delete(deleteTarget.id);
      toast({ variant: 'success', title: 'Berhasil', description: 'Ruangan berhasil dihapus.' });
      setDeleteTarget(null);
      void loadRooms();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal menghapus ruangan.' });
    }
  };

  const filteredData = useMemo(() => {
    return rooms.filter((room) => {
      const roomType = room.room_type || room.type || 'poliklinik';
      const matchesType = roomTypeFilter === 'all' || roomType === roomTypeFilter;
      if (!matchesType) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        room.name?.toLowerCase().includes(q) ||
        room.code?.toLowerCase().includes(q) ||
        room.description?.toLowerCase().includes(q)
      );
    });
  }, [rooms, search, roomTypeFilter]);

  const columns = useMemo<ColumnDef<MedicineRoom>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="h-8 p-0 hover:bg-transparent">
          Ruangan
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const room = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium text-sm">{room.name}</span>
            <span className="text-xs font-mono text-muted-foreground">{room.code}</span>
          </div>
        );
      },
    },
    {
      id: 'room_type',
      header: 'Jenis Ruangan',
      cell: ({ row }) => {
        const room = row.original;
        const roomType = room.room_type || room.type || 'lainnya';
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="rounded-none text-[11px]">
              {ROOM_TYPE_LABEL[roomType] || roomType}
            </Badge>
            {room.is_default_depo && (
              <Badge variant="secondary" className="rounded-none text-[10px]">Default Depo</Badge>
            )}
            {room.is_default_apotek && (
              <Badge variant="secondary" className="rounded-none text-[10px]">Default Apotek</Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'total_medicines',
      header: () => <div className="text-right">Jenis Obat</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-medium">
          {(row.original.total_medicines ?? 0).toLocaleString('id-ID')}
        </div>
      ),
    },
    {
      accessorKey: 'total_stock',
      header: () => <div className="text-right">Total Stok</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-semibold">
          {(row.original.total_stock ?? 0).toLocaleString('id-ID')}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'} className="rounded-none">
          {row.original.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const room = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              title="Detail Ruangan"
              onClick={() => navigate(`/polyclinics/${room.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canUpdate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-none"
                title="Edit Ruangan"
                onClick={() => openEditDialog(room)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {canDelete && !room.is_default_depo && !room.is_default_apotek && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-none text-destructive"
                title="Hapus Ruangan"
                onClick={() => setDeleteTarget(room)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ], [canDelete, canUpdate, navigate, openEditDialog]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-2 p-3 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Stok Obat Per Ruangan
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau kode ruangan..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <div className="w-44">
              <SearchableSelect
                options={[{ value: 'all', label: 'Semua Jenis Ruangan' }, ...ROOM_TYPE_OPTIONS]}
                value={roomTypeFilter}
                onValueChange={(v) => setRoomTypeFilter(v || 'all')}
                placeholder="Jenis ruangan..."
                square
                className="h-9 text-xs rounded-none"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>

            {canCreate && (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={openCreateDialog}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Ruangan
              </Button>
            )}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data ruangan yang sesuai."
          />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Ruangan' : 'Tambah Ruangan'}</DialogTitle>
            <DialogDescription>
              Atur informasi ruangan dan jenis unit penyimpanan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Kode Ruangan *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Misal: UNIT-IGD"
                className="h-9 text-xs rounded-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nama Ruangan *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Misal: Depo IGD"
                className="h-9 text-xs rounded-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Jenis Ruangan</Label>
              <SearchableSelect
                options={ROOM_TYPE_OPTIONS}
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v || 'lainnya' })}
                placeholder="Pilih jenis ruangan..."
                square
                className="h-9 text-xs rounded-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Keterangan</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Deskripsi singkat ruangan..."
                className="h-9 text-xs rounded-none"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-medium">Status Aktif</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="rounded-none">
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="rounded-none">
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Ruangan"
        description={`Apakah Anda yakin ingin menghapus ruangan "${deleteTarget?.name}"?`}
        onConfirm={handleDelete}
        confirmText="Hapus"
        variant="destructive"
      />
    </div>
  );
}
