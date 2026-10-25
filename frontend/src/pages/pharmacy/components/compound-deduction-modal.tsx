import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FlaskConical,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Save,
  Minus,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrescriptionCompound, PrescriptionCompoundItem } from '@/lib/api';

export interface CompoundDeductionItem {
  compound_item_id: number;
  quantity: number;
}

interface CompoundDeductionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compounds: PrescriptionCompound[];
  patientName?: string;
  isDispenseStep?: boolean;
  onConfirm: (deductions: CompoundDeductionItem[]) => void;
  onSaveOnly?: (deductions: CompoundDeductionItem[]) => Promise<void>;
  loading?: boolean;
}

export function CompoundDeductionModal({
  open,
  onOpenChange,
  compounds,
  patientName,
  isDispenseStep = true,
  onConfirm,
  onSaveOnly,
  loading = false,
}: CompoundDeductionModalProps) {
  // State mapping compound_item_id -> quantity to deduct
  const [deductions, setDeductions] = useState<Record<number, number>>({});
  const [savingOnly, setSavingOnly] = useState(false);

  // Initialize or reset deductions whenever compounds or modal open changes
  useEffect(() => {
    if (open && compounds.length > 0) {
      const initial: Record<number, number> = {};
      compounds.forEach((comp) => {
        (comp.items || []).forEach((item: PrescriptionCompoundItem) => {
          initial[item.id] = typeof item.quantity === 'number' ? item.quantity : 1;
        });
      });
      setDeductions(initial);
    }
  }, [open, compounds]);

  const handleQuantityChange = (itemId: number, newQty: number) => {
    const validQty = Math.max(0, isNaN(newQty) ? 0 : newQty);
    setDeductions((prev) => ({
      ...prev,
      [itemId]: validQty,
    }));
  };

  const handleStepQuantity = (itemId: number, delta: number) => {
    setDeductions((prev) => {
      const current = prev[itemId] ?? 1;
      const nextVal = Math.max(0, current + delta);
      return {
        ...prev,
        [itemId]: nextVal,
      };
    });
  };

  const toDeductionList = (): CompoundDeductionItem[] => {
    return Object.entries(deductions).map(([idStr, qty]) => ({
      compound_item_id: Number(idStr),
      quantity: Number(qty),
    }));
  };

  const handleProceedToDispense = () => {
    onConfirm(toDeductionList());
  };

  const handleSaveOnlyClick = async () => {
    if (!onSaveOnly) return;
    setSavingOnly(true);
    try {
      await onSaveOnly(toDeductionList());
      onOpenChange(false);
    } finally {
      setSavingOnly(false);
    }
  };

  // Check if any ingredient has stock shortage compared to entered deduction
  let hasShortage = false;
  let hasZeroDeduction = false;

  compounds.forEach((comp) => {
    (comp.items || []).forEach((item: PrescriptionCompoundItem) => {
      const enteredQty = deductions[item.id] ?? item.quantity ?? 1;
      const currentStock = item.medicine?.current_stock ?? 0;
      if (enteredQty > currentStock) {
        hasShortage = true;
      }
      if (enteredQty === 0) {
        hasZeroDeduction = true;
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none border-border p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-primary/30 bg-primary/10 text-primary shrink-0 mt-0.5">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Validasi Pengurangan Stok Obat Racikan
                {patientName && (
                  <span className="text-xs font-normal text-muted-foreground font-mono">
                    ({patientName})
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Tentukan dan sesuaikan jumlah fisik obat/bahan obat racikan yang riil diambil dari stok apotek sebelum penyerahan obat.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body / Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {compounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Tidak ada obat racikan pada order resep ini.
            </div>
          ) : (
            compounds.map((compound, compIdx) => (
              <div
                key={`compound-group-${compound.id || compIdx}`}
                className="border border-border bg-card shadow-none"
              >
                {/* Compound Header */}
                <div className="bg-muted/30 border-b border-border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      {compound.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono px-1.5 py-0 rounded-none bg-primary/10 text-primary border-primary/30"
                    >
                      {compound.preparation_type || 'Racikan'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Output:{' '}
                      <strong className="text-foreground font-mono">
                        {compound.output_quantity} {compound.output_unit || 'bungkus'}
                      </strong>
                    </span>
                    {compound.instructions && (
                      <>
                        <span>•</span>
                        <span className="italic">{compound.instructions}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ingredients Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/10 text-[11px] font-semibold text-muted-foreground text-left">
                        <th className="py-2 px-3">Bahan Obat</th>
                        <th className="py-2 px-3 text-center">Stok Apotek</th>
                        <th className="py-2 px-3 text-center">Hitungan Resep</th>
                        <th className="py-2 px-3 text-center w-48">Potong Stok Riil (Farmasi)</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(compound.items || []).map((item: PrescriptionCompoundItem) => {
                        const medicine = item.medicine;
                        const currentStock = medicine?.current_stock ?? 0;
                        const enteredQty = deductions[item.id] ?? item.quantity ?? 1;
                        const isShortage = enteredQty > currentStock;
                        const isZero = enteredQty === 0;
                        const unitName = medicine?.unit?.name || 'item';

                        return (
                          <tr
                            key={`ingredient-${item.id}`}
                            className={cn(
                              'hover:bg-muted/10 transition-colors',
                              isShortage && 'bg-destructive/5'
                            )}
                          >
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-foreground">
                                {medicine?.name || `Obat #${item.medicine_id}`}
                              </p>
                              {medicine?.strength && (
                                <p className="text-[11px] text-muted-foreground">
                                  Kekuatan: {medicine.strength}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-[10px] text-muted-foreground italic mt-0.5">
                                  {item.notes}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={cn(
                                  'font-mono font-medium',
                                  currentStock <= 0
                                    ? 'text-destructive font-bold'
                                    : 'text-foreground'
                                )}
                              >
                                {currentStock} {unitName}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">
                              {item.quantity} {unitName}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
                                  onClick={() => handleStepQuantity(item.id, -1)}
                                  disabled={enteredQty <= 0}
                                  title="Kurangi 1"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <div className="relative w-24">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={enteredQty}
                                    onChange={(e) =>
                                      handleQuantityChange(item.id, parseInt(e.target.value, 10))
                                    }
                                    className={cn(
                                      'h-7 text-center rounded-none font-mono text-xs font-semibold px-1 focus:ring-inset',
                                      isShortage && 'border-destructive text-destructive font-bold',
                                      isZero && 'text-muted-foreground'
                                    )}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
                                  onClick={() => handleStepQuantity(item.id, 1)}
                                  title="Tambah 1"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <span className="text-[11px] text-muted-foreground ml-1 shrink-0 font-medium">
                                  {unitName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isShortage ? (
                                <Badge
                                  variant="destructive"
                                  className="rounded-none text-[10px] px-1.5 py-0 gap-1 uppercase"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Stok Kurang
                                </Badge>
                              ) : isZero ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-none text-[10px] px-1.5 py-0 text-muted-foreground border-dashed"
                                >
                                  Tidak Dipotong
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="rounded-none text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1"
                                >
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  Tersedia
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          {/* Shortage Warning */}
          {hasShortage && (
            <div className="bg-destructive/10 border border-destructive/30 p-3 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Perhatian:</strong> Terdapat bahan racikan dengan jumlah pemotongan yang melebihi sisa stok apotek saat ini. Pastikan stok fisik tersedia sebelum melanjutkan.
              </span>
            </div>
          )}

          {hasZeroDeduction && (
            <div className="bg-muted/40 border border-border p-2.5 text-muted-foreground text-[11px] flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Bahan dengan jumlah <strong>0</strong> tidak akan dipotong dari stok apotek.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 sm:p-4 border-t border-border bg-muted/20 shrink-0 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none text-xs"
            onClick={() => onOpenChange(false)}
            disabled={loading || savingOnly}
          >
            Batal
          </Button>

          <div className="flex items-center gap-2">
            {onSaveOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => void handleSaveOnlyClick()}
                disabled={loading || savingOnly}
              >
                <Save className="h-3.5 w-3.5" />
                <span>Simpan Penyesuaian</span>
              </Button>
            )}

            {isDispenseStep && (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                onClick={handleProceedToDispense}
                disabled={loading || savingOnly}
              >
                <span>Validasi Stok & Lanjut Serahkan</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
