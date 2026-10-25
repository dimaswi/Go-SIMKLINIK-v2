import { useMemo, useState } from 'react';
import { Loader2, Search, ShieldCheck, X, Database, Filter } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { medicinesApi, type KFAProductDetail, type KFAProductSearchItem } from '@/lib/api';

type KFAProductPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (detail: KFAProductDetail) => void;
};

export function KFAProductPickerDialog({ open, onOpenChange, onSelect }: KFAProductPickerDialogProps) {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectingCode, setSelectingCode] = useState('');
  const [results, setResults] = useState<KFAProductSearchItem[]>([]);
  const [lastSearchedKeyword, setLastSearchedKeyword] = useState('');

  const handleSearch = async () => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      toast({ variant: 'destructive', title: 'Keyword kosong', description: 'Masukkan kata kunci sebelum mencari produk KFA.' });
      return;
    }

    setLoading(true);
    try {
      // Ambil hingga 50 produk dari API KFA untuk hasil yang lebih lengkap
      const response = await medicinesApi.searchKFA(trimmedKeyword, 1, 50);
      const items = response.data.data?.data || [];
      setResults(items);
      setLastSearchedKeyword(trimmedKeyword);
      setTableFilter('');
      if (items.length === 0) {
        toast({ title: 'Tidak ditemukan', description: `Tidak ada produk KFA dengan kata kunci "${trimmedKeyword}".` });
      }
    } catch (error: any) {
      setResults([]);
      toast({ variant: 'destructive', title: 'Gagal mencari KFA', description: error.response?.data?.error || 'Produk KFA belum bisa diambil dari server.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item: KFAProductSearchItem) => {
    setSelectingCode(item.kfa_code);
    try {
      const response = await medicinesApi.getKFADetail(item.kfa_code);
      const detail = response.data.data;
      onSelect(detail);
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal memuat detail KFA', description: error.response?.data?.error || 'Detail produk KFA belum bisa diambil.' });
    } finally {
      setSelectingCode('');
    }
  };

  // Filter pencarian lokal di dalam Data Table dari data yang sudah diambil
  const filteredResults = useMemo(() => {
    if (!tableFilter.trim()) return results;
    const query = tableFilter.toLowerCase().trim();
    return results.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const code = (item.kfa_code || '').toLowerCase();
      const dosage = (item.dosage_form?.name || '').toLowerCase();
      const uom = (item.uom?.name || '').toLowerCase();
      const manufacturer = (item.manufacturer || '').toLowerCase();
      const template = (item.product_template?.name || '').toLowerCase();
      return (
        name.includes(query) ||
        code.includes(query) ||
        dosage.includes(query) ||
        uom.includes(query) ||
        manufacturer.includes(query) ||
        template.includes(query)
      );
    });
  }, [results, tableFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[860px] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-semibold tracking-tight">Pilih Produk KFA SATUSEHAT</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-5">
            Cari produk farmasi dari API KFA SATUSEHAT, lalu pilih untuk menyimpan mapping resmi ke master obat.
          </DialogDescription>
        </DialogHeader>

        {/* Baris 1: Pencarian API KFA (Ambil Data Pertama) */}
        <div className="border-b border-border/70 bg-background px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="Cari ke API KFA... Contoh: amoxan, amlodipine, paracetamol, sirup kering"
                className="h-10 rounded-none text-sm pr-9"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              type="button"
              onClick={() => void handleSearch()}
              disabled={loading}
              className="rounded-none shadow-none md:min-w-36"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Cari KFA
            </Button>
          </div>

          {/* Baris 2: Filter Data Table (Pencarian dari data yang sudah diambil) */}
          {results.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-border/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="Cari pada data table (nama, kode, sediaan, pabrikan)..."
                  className="h-8 pl-8 pr-8 text-xs rounded-none"
                />
                {tableFilter && (
                  <button
                    type="button"
                    onClick={() => setTableFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="rounded-none font-mono text-[11px]">
                  {filteredResults.length} / {results.length} data
                </Badge>
                {lastSearchedKeyword && (
                  <span className="hidden sm:inline">dari pencarian &ldquo;{lastSearchedKeyword}&rdquo;</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Area Konten Data Table */}
        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          <div className="p-4 sm:p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Mengambil data produk dari API KFA SATUSEHAT...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/80 bg-background px-4">
                <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {lastSearchedKeyword ? `Tidak ada data ditemukan untuk "${lastSearchedKeyword}"` : 'Belum ada data KFA yang diambil'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Ketik nama obat atau zat aktif pada kolom pencarian di atas lalu klik <strong>Cari KFA</strong> untuk mengambil data dari server Kemenkes.
                </p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/80 bg-background px-4">
                <Filter className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">Tidak ada produk yang cocok dengan filter tabel &ldquo;{tableFilter}&rdquo;</p>
                <p className="text-xs text-muted-foreground mt-1">Coba kata kunci pencarian filter lain atau hapus filter untuk melihat seluruh hasil.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-none text-xs"
                  onClick={() => setTableFilter('')}
                >
                  Reset Filter
                </Button>
              </div>
            ) : (
              <div className="border border-border/80 bg-background shadow-none overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-b border-border/80 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <TableHead className="w-[120px]">Kode KFA</TableHead>
                      <TableHead className="min-w-[260px]">Nama Produk KFA</TableHead>
                      <TableHead className="w-[130px]">Bentuk Sediaan</TableHead>
                      <TableHead className="w-[100px]">Satuan</TableHead>
                      <TableHead className="w-[150px]">Pabrikan</TableHead>
                      <TableHead className="w-[90px] text-center">Status</TableHead>
                      <TableHead className="w-[130px] text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {filteredResults.map((item) => {
                      const isSelecting = selectingCode === item.kfa_code;
                      return (
                        <TableRow key={item.kfa_code} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs font-medium">
                            <Badge variant="outline" className="rounded-none font-mono text-[11px] bg-muted/20">
                              {item.kfa_code}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium text-foreground text-xs sm:text-sm leading-tight">{item.name}</p>
                              {item.product_template?.name && (
                                <p className="text-[11px] text-muted-foreground">
                                  Template: {item.product_template.name}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-foreground/90">
                            {item.dosage_form?.name ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-[11px] font-medium border border-sky-200 dark:border-sky-800">
                                {item.dosage_form.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-foreground/90">
                            {item.uom?.name || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-xs text-foreground/80">
                            {item.manufacturer || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={item.active ? 'default' : 'secondary'}
                              className="rounded-none text-[10px] px-1.5 py-0 uppercase"
                            >
                              {item.active ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleSelect(item)}
                              disabled={isSelecting}
                              className="rounded-none shadow-none text-xs h-8 px-2.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              {isSelecting ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Pakai Mapping
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-3 sm:justify-between flex items-center">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            {results.length > 0 ? `Total ${results.length} data produk dimuat dari API KFA.` : 'KFA Kemkes RI v2'}
          </p>
          <Button type="button" variant="outline" className="rounded-none text-xs h-8" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}