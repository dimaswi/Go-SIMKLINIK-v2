import { useMemo, useState } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [selectingCode, setSelectingCode] = useState('');
  const [results, setResults] = useState<KFAProductSearchItem[]>([]);

  const emptyStateMessage = useMemo(() => {
    if (!keyword.trim()) return 'Masukkan kata kunci nama obat, nama dagang, atau template KFA.';
    if (loading) return 'Mencari produk KFA...';
    return 'Tidak ada produk KFA yang cocok dengan pencarian ini.';
  }, [keyword, loading]);

  const resultCountLabel = useMemo(() => {
    if (loading) return 'Mencari produk KFA...';
    if (results.length === 0) return 'Belum ada hasil.';
    return `${results.length} produk siap dipakai untuk mapping.`;
  }, [loading, results.length]);

  const handleSearch = async () => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      toast({ variant: 'destructive', title: 'Keyword kosong', description: 'Masukkan kata kunci sebelum mencari produk KFA.' });
      return;
    }

    setLoading(true);
    try {
      const response = await medicinesApi.searchKFA(trimmedKeyword, 1, 10);
      setResults(response.data.data?.data || []);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[840px] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="text-lg font-semibold tracking-tight">Pilih Produk KFA</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Cari produk farmasi dari API KFA SATUSEHAT, lalu simpan mapping-nya ke master obat lokal.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/70 px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Contoh: amlodipine, paracetamol, rifampicin"
              className="h-10 rounded-none text-sm"
            />
            <Button type="button" onClick={() => void handleSearch()} disabled={loading} className="rounded-none shadow-none md:min-w-36">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Cari KFA
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="rounded-none">API KFA SATUSEHAT</Badge>
            <span>{resultCountLabel}</span>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          <div className="space-y-3 px-6 py-5">
            {results.length === 0 ? (
              <div className="rounded-none border border-dashed border-border/80 bg-background px-4 py-6 text-sm text-muted-foreground">
                {emptyStateMessage}
              </div>
            ) : (
              results.map((item) => {
                const selecting = selectingCode === item.kfa_code;
                return (
                  <div key={item.kfa_code} className="rounded-none border border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.02),rgba(2,132,199,0.03),rgba(255,255,255,1))] p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{item.name}</p>
                            <Badge variant="outline" className="rounded-none">KFA {item.kfa_code}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {item.dosage_form?.name ? <span>{item.dosage_form.name}</span> : null}
                            {item.uom?.name ? <span>{item.uom.name}</span> : null}
                            {item.product_template?.name ? <span>Template {item.product_template.name}</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.active ? 'default' : 'secondary'} className="rounded-none">
                            {item.active ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                          {item.state ? <Badge variant="outline" className="rounded-none uppercase">{item.state}</Badge> : null}
                          {item.farmalkes_type?.name ? <Badge variant="outline" className="rounded-none">{item.farmalkes_type.name}</Badge> : null}
                        </div>
                        <div className="grid gap-3 text-xs leading-5 text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-none border border-border/70 bg-background/90 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pabrikan</p>
                            <p className="mt-1 text-foreground/90">{item.manufacturer || '-'}</p>
                          </div>
                          <div className="rounded-none border border-border/70 bg-background/90 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bentuk</p>
                            <p className="mt-1 text-foreground/90">{item.dosage_form?.name || '-'}</p>
                          </div>
                          <div className="rounded-none border border-border/70 bg-background/90 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Satuan</p>
                            <p className="mt-1 text-foreground/90">{item.uom?.name || '-'}</p>
                          </div>
                          <div className="rounded-none border border-border/70 bg-background/90 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Template</p>
                            <p className="mt-1 text-foreground/90">{item.product_template?.name || '-'}</p>
                          </div>
                        </div>
                      </div>

                      <Button type="button" variant="outline" onClick={() => void handleSelect(item)} disabled={selecting} className="rounded-none shadow-none lg:min-w-40">
                        {selecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Pakai Mapping
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}