import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { medicalRecordsApi, type MedicalRecord } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { Eye, FilePenLine, FileText, Loader2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';

const columns: ColumnDef<MedicalRecord>[] = [
  {
    accessorKey: 'record_date',
    header: 'Tanggal',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {new Date(row.original.record_date).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    id: 'patient',
    header: 'Pasien',
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium">{row.original.patient?.full_name || '-'}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
      </div>
    ),
  },
  {
    id: 'visit',
    header: 'Kunjungan',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.visit?.visit_number || '-'}
      </span>
    ),
  },
  {
    id: 'doctor',
    header: 'Dokter',
    cell: ({ row }) => <span className="text-sm">{row.original.doctor?.full_name || '-'}</span>,
  },
  {
    id: 'polyclinic',
    header: 'Poliklinik',
    cell: ({ row }) => <span className="text-sm">{row.original.polyclinic?.name || '-'}</span>,
  },
  {
    id: 'diagnosis',
    header: 'Diagnosis',
    cell: ({ row }) => {
      const primaryCodes = (row.original.diagnoses || [])
        .filter((diagnosis) => diagnosis.diagnosis_type === 'primer')
        .map((diagnosis) => diagnosis.icd10?.code)
        .filter(Boolean);

      if (primaryCodes.length === 0) {
        return <span className="text-sm text-muted-foreground">-</span>;
      }

      return <span className="text-sm">{primaryCodes.join(', ')}</span>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'final' ? 'default' : 'secondary'}>
        {row.original.status === 'final' ? 'Final' : 'Draft'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: 'Aksi',
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Link to={`/emr/${row.original.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
          {row.original.status === 'draft' ? <FilePenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Link>
      </div>
    ),
  },
];

export default function MedicalRecordsIndex() {
  const { toast } = useToast();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await medicalRecordsApi.getAll('per_page=100');
      setRecords(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Gagal memuat data rekam medis' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Rekam Medis');
    loadData();
  }, [loadData]);

  const filtered = records.filter((record) => {
    if (statusFilter && record.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Cari pasien, no. RM, no. kunjungan, atau dokter..."
        pageSize={20}
        toolbarActions={
          <>
            <SearchableSelect
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'final', label: 'Final' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status Rekam Medis"
              noneLabel="Semua Status"
              className="w-44"
            />
          </>
        }
      />
      <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>Total {records.length} rekam medis</span>
      </div>
    </div>
  );
}
