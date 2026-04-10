import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { resolveAssetUrl, type MedicalRecordPhysicalExamImage, type PhysicalExamImageMaster } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ImagePlus, MapPin, X } from 'lucide-react';

type PhysicalExamImagePickerProps = {
  masters: PhysicalExamImageMaster[];
  value: MedicalRecordPhysicalExamImage[];
  onChange: (nextValue: MedicalRecordPhysicalExamImage[]) => void;
  readOnly: boolean;
};

type PendingMarkerDraft = {
  masterId: number;
  masterName: string;
  markerIndex: number;
  posX: number;
  posY: number;
  markerLabel: string;
};

function getMarkerNumberLabel(index: number) {
  return `${index + 1}.`;
}

function stripMarkerNumberPrefix(markerLabel: string) {
  return markerLabel.replace(/^\s*\d+\.\s*/, '').trimStart();
}

function normalizeSelections(selections: MedicalRecordPhysicalExamImage[]) {
  return selections.map((selection, index) => ({
    ...selection,
    notes: selection.notes || '',
    sort_order: selection.sort_order || index + 1,
    markers: (selection.markers || []).map((marker) => ({
      ...marker,
      marker_label: stripMarkerNumberPrefix(marker.marker_label || ''),
    })),
  }));
}

export function PhysicalExamImagePicker({ masters, value, onChange, readOnly }: PhysicalExamImagePickerProps) {
  const [pickerValue, setPickerValue] = useState('');
  const [pendingMarker, setPendingMarker] = useState<PendingMarkerDraft | null>(null);

  const masterMap = useMemo(() => {
    return new Map(masters.map((item) => [item.id, item]));
  }, [masters]);

  const selectedMasterIds = useMemo(() => new Set(value.map((item) => item.physical_exam_image_master_id)), [value]);
  const availableMasterOptions = useMemo(() => {
    return masters
      .filter((item) => !selectedMasterIds.has(item.id))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((item) => ({
        value: String(item.id),
        label: item.name,
      }));
  }, [masters, selectedMasterIds]);

  const selectedItems = useMemo(() => {
    return normalizeSelections(value).map((item, index) => ({
      ...item,
      sort_order: index + 1,
      master: item.master || masterMap.get(item.physical_exam_image_master_id),
    }));
  }, [masterMap, value]);

  const updateSelections = (updater: (currentValue: MedicalRecordPhysicalExamImage[]) => MedicalRecordPhysicalExamImage[]) => {
    onChange(normalizeSelections(updater(value)).map((item, index) => ({ ...item, sort_order: index + 1 })));
  };

  const addSelection = (masterIdValue: string) => {
    if (readOnly) {
      return;
    }

    setPickerValue('');

    const masterId = Number(masterIdValue);
    const master = masterMap.get(masterId);
    if (!master || selectedMasterIds.has(masterId)) {
      return;
    }

    updateSelections((currentValue) => {
      return [
        ...currentValue,
        {
          physical_exam_image_master_id: master.id,
          notes: '',
          sort_order: currentValue.length + 1,
          master,
          markers: [],
        },
      ];
    });
  };

  const removeSelection = (masterId: number) => {
    if (readOnly) {
      return;
    }

    updateSelections((currentValue) => currentValue.filter((item) => item.physical_exam_image_master_id !== masterId));
  };

  const updateSelection = (masterId: number, updater: (currentItem: MedicalRecordPhysicalExamImage) => MedicalRecordPhysicalExamImage) => {
    updateSelections((currentValue) => currentValue.map((item) => (item.physical_exam_image_master_id === masterId ? updater(item) : item)));
  };

  const handleAddMarker = (masterId: number, event: MouseEvent<HTMLButtonElement>) => {
    if (readOnly) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const posX = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const posY = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2));
    const nextMarkerIndex = value.find((item) => item.physical_exam_image_master_id === masterId)?.markers.length || 0;

    setPendingMarker({
      masterId,
      masterName: masterMap.get(masterId)?.name || 'Gambar pemeriksaan',
      markerIndex: nextMarkerIndex,
      posX: Math.max(0, Math.min(100, posX)),
      posY: Math.max(0, Math.min(100, posY)),
      markerLabel: '',
    });
  };

  const removeMarker = (masterId: number, markerIndex: number) => {
    if (readOnly) {
      return;
    }

    updateSelection(masterId, (currentItem) => ({
      ...currentItem,
      markers: currentItem.markers.filter((_, index) => index !== markerIndex),
    }));
  };

  const updateMarkerLabel = (masterId: number, markerIndex: number, markerLabel: string) => {
    updateSelection(masterId, (currentItem) => ({
      ...currentItem,
      markers: currentItem.markers.map((marker, index) => (
        index === markerIndex ? { ...marker, marker_label: markerLabel } : marker
      )),
    }));
  };

  const closePendingMarkerDialog = () => {
    setPendingMarker(null);
  };

  const confirmPendingMarker = () => {
    if (!pendingMarker) {
      return;
    }

    updateSelection(pendingMarker.masterId, (currentItem) => ({
      ...currentItem,
      markers: [
        ...currentItem.markers,
        {
          marker_label: pendingMarker.markerLabel,
          pos_x: pendingMarker.posX,
          pos_y: pendingMarker.posY,
        },
      ],
    }));

    closePendingMarkerDialog();
  };

  if (!masters.length && !selectedItems.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
        Belum ada template gambar pemeriksaan fisik aktif. Tambahkan dulu dari master data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border-b border-border/70 pb-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-end">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Pilih gambar pemeriksaan</p>
          <p className="text-xs text-muted-foreground">Cukup cari berdasarkan nama gambar, lalu pilih untuk menambah ke daftar pemeriksaan.</p>
          <SearchableSelect
            options={availableMasterOptions}
            value={pickerValue}
            onValueChange={addSelection}
            placeholder={availableMasterOptions.length ? 'Cari nama gambar...' : 'Semua gambar sudah dipilih'}
            searchPlaceholder="Cari nama gambar..."
            emptyText="Gambar tidak ditemukan."
            disabled={readOnly || !availableMasterOptions.length}
          />
        </div>
        <div className="flex items-center justify-start text-xs text-muted-foreground lg:justify-end">
          {selectedItems.length} gambar dipilih
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Gambar terpilih</p>
            <p className="text-xs text-muted-foreground">Klik area gambar untuk memilih lokasi marker. Setelah itu modal marker akan muncul untuk mengisi keterangannya.</p>
          </div>
        </div>

        {!selectedItems.length ? (
          <div className="flex min-h-28 flex-col items-center justify-center border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            <ImagePlus className="mb-2 h-5 w-5" />
            Pilih satu atau lebih template gambar dari pencarian nama di atas.
          </div>
        ) : (
          <div className="space-y-5">
            {selectedItems.map((item) => {
              const master = item.master || masterMap.get(item.physical_exam_image_master_id);
              if (!master) {
                return null;
              }

              return (
                <div key={item.physical_exam_image_master_id} className="grid gap-4 border-t border-border/70 pt-4 first:border-t-0 first:pt-0 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{master.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{master.location || 'Lokasi umum'}</span>
                          <span>Kategori: {master.category || '-'}</span>
                        </div>
                      </div>
                      {!readOnly ? (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSelection(master.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className={cn(
                        'relative block aspect-[4/3] w-full overflow-hidden border bg-muted/10 text-left',
                        !readOnly && 'cursor-crosshair'
                      )}
                      onClick={(event) => handleAddMarker(master.id, event)}
                      disabled={readOnly}
                    >
                      <img src={resolveAssetUrl(master.image_url)} alt={master.name} className="h-full w-full object-contain" />
                      {item.markers.map((marker, markerIndex) => (
                        <span
                          key={`${master.id}-${markerIndex}-${marker.pos_x}-${marker.pos_y}`}
                          className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[11px] font-semibold text-white shadow"
                          style={{ left: `${marker.pos_x}%`, top: `${marker.pos_y}%` }}
                        >
                          {markerIndex + 1}
                        </span>
                      ))}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Titik Penanda</p>
                      <div className="border border-border/70">
                        {item.markers.length ? item.markers.map((marker, markerIndex) => (
                          <div key={`${master.id}-marker-${markerIndex}`} className="grid grid-cols-[36px_minmax(0,1fr)_72px] items-start border-b border-border/70 text-xs last:border-b-0">
                            <div className="px-2 py-3 text-center font-medium text-foreground">
                              {getMarkerNumberLabel(markerIndex)}
                            </div>
                            <div className="px-2 py-2">
                              <Textarea
                                value={marker.marker_label}
                                onChange={(event) => updateMarkerLabel(master.id, markerIndex, event.target.value)}
                                disabled={readOnly}
                                placeholder="Tulis penanda"
                                rows={2}
                                className="min-h-[52px] rounded-none border-0 px-0 py-1 text-xs leading-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
                              />
                            </div>
                            <div className="px-2 py-2 text-right">
                              {!readOnly ? (
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => removeMarker(master.id, markerIndex)}>
                                  Hapus
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        )) : <p className="px-2 py-3 text-xs text-muted-foreground">Belum ada titik. Klik gambar untuk memberi tanda.</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan Gambar</p>
                      <Textarea
                        value={item.notes}
                        onChange={(event) => updateSelection(master.id, (currentItem) => ({ ...currentItem, notes: event.target.value }))}
                        disabled={readOnly}
                        rows={5}
                        placeholder="Misalnya: lesi tampak pada mukosa bukal kanan, sekitar 2 cm dari komisura."
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(pendingMarker)} onOpenChange={(open) => {
        if (!open) {
          closePendingMarkerDialog();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Marker</DialogTitle>
            <DialogDescription>
              {pendingMarker
                ? `Marker ${pendingMarker.markerIndex + 1} untuk ${pendingMarker.masterName}. Isi keterangan marker lalu simpan.`
                : 'Isi keterangan marker.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Keterangan Marker</p>
            <Textarea
              value={pendingMarker?.markerLabel || ''}
              onChange={(event) => {
                const nextValue = event.target.value;
                setPendingMarker((current) => (current ? { ...current, markerLabel: nextValue } : current));
              }}
              placeholder="Tulis penanda"
              rows={4}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePendingMarkerDialog}>
              Batal
            </Button>
            <Button type="button" onClick={confirmPendingMarker}>
              Simpan Marker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}