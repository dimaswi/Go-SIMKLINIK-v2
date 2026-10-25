import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Patient } from '@/lib/api';

export function createColumns(onDelete: (id: number) => void): ColumnDef<Patient>[] {
  return [
    {
      accessorKey: 'medical_record_number',
      header: 'No. RM',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.medical_record_number}</span>
      ),
      meta: {
        headerClassName: 'w-[120px] pl-4 whitespace-nowrap',
        cellClassName: 'w-[120px] pl-4 whitespace-nowrap',
      },
    },
    {
      accessorKey: 'full_name',
      header: 'Nama Pasien',
      cell: ({ row }) => (
        <div className="min-w-[180px]">
          <p className="font-medium text-sm text-foreground">{row.original.full_name}</p>
          {row.original.nik && <p className="text-xs text-muted-foreground font-mono">NIK: {row.original.nik}</p>}
        </div>
      ),
      meta: {
        headerClassName: 'min-w-[200px]',
        cellClassName: 'min-w-[200px]',
      },
    },
    {
      accessorKey: 'gender',
      header: 'JK',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
      ),
      meta: {
        headerClassName: 'w-[100px] whitespace-nowrap',
        cellClassName: 'w-[100px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'birth_date',
      header: 'Tgl. Lahir',
      cell: ({ row }) => {
        if (!row.original.birth_date) return <span className="text-muted-foreground text-sm">-</span>;
        const d = new Date(row.original.birth_date);
        const age = Math.floor((Date.now() - d.getTime()) / 31536000000);
        return (
          <div className="whitespace-nowrap">
            <p className="text-sm">{d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <p className="text-xs text-muted-foreground">{age} tahun</p>
          </div>
        );
      },
      meta: {
        headerClassName: 'w-[130px] whitespace-nowrap',
        cellClassName: 'w-[130px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'phone',
      header: 'Telepon',
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{row.original.phone || '-'}</span>,
      meta: {
        headerClassName: 'w-[130px] whitespace-nowrap',
        cellClassName: 'w-[130px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'insurance_type',
      header: 'Asuransi',
      cell: ({ row }) => {
        const t = row.original.insurance_type;
        if (!t || t === 'umum') return <Badge variant="secondary" className="rounded-none">Umum</Badge>;
        if (t === 'bpjs') return <Badge variant="default" className="rounded-none">BPJS</Badge>;
        return <Badge variant="outline" className="rounded-none">{t}</Badge>;
      },
      meta: {
        headerClassName: 'w-[110px] whitespace-nowrap',
        cellClassName: 'w-[110px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'} className="rounded-none">
          {row.original.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
      meta: {
        headerClassName: 'w-[100px] whitespace-nowrap',
        cellClassName: 'w-[100px] whitespace-nowrap',
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right pr-2">Aksi</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" asChild title="Lihat Detail">
            <Link to={`/patients/${row.original.id}`}><Eye className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" asChild title="Edit Pasien">
            <Link to={`/patients/${row.original.id}/edit`}><Edit className="h-4 w-4" /></Link>
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 rounded-none text-destructive hover:text-destructive"
            onClick={() => onDelete(row.original.id)}
            title="Hapus Pasien"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      meta: {
        headerClassName: 'w-[120px] text-right pr-4 whitespace-nowrap',
        cellClassName: 'w-[120px] text-right pr-4 whitespace-nowrap',
      },
    },
  ];
}
