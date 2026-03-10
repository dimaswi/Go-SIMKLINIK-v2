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
    },
    {
      accessorKey: 'full_name',
      header: 'Nama Pasien',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.full_name}</p>
          {row.original.nik && <p className="text-xs text-muted-foreground">NIK: {row.original.nik}</p>}
        </div>
      ),
    },
    {
      accessorKey: 'gender',
      header: 'JK',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
      ),
    },
    {
      accessorKey: 'birth_date',
      header: 'Tgl. Lahir',
      cell: ({ row }) => {
        if (!row.original.birth_date) return <span className="text-muted-foreground text-sm">-</span>;
        const d = new Date(row.original.birth_date);
        const age = Math.floor((Date.now() - d.getTime()) / 31536000000);
        return (
          <div>
            <p className="text-sm">{d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <p className="text-xs text-muted-foreground">{age} tahun</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: 'Telepon',
      cell: ({ row }) => <span className="text-sm">{row.original.phone || '-'}</span>,
    },
    {
      accessorKey: 'insurance_type',
      header: 'Asuransi',
      cell: ({ row }) => {
        const t = row.original.insurance_type;
        if (!t || t === 'umum') return <Badge variant="secondary">Umum</Badge>;
        if (t === 'bpjs') return <Badge variant="default">BPJS</Badge>;
        return <Badge variant="outline">{t}</Badge>;
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to={`/patients/${row.original.id}`}><Eye className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to={`/patients/${row.original.id}/edit`}><Edit className="h-4 w-4" /></Link>
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];
}
