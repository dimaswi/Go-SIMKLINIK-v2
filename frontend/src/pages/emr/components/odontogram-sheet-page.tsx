import { useEffect, useMemo, useState } from 'react';
import { CircleX, FilePlus2, Loader2, Lock, Printer, Save, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { odontogramApi, type FinalizeVisitPayload, type MedicalRecord, type OdontogramEntry, type SatusehatVisitAutoSyncResult, type Visit } from '@/lib/api';
import { createControlScheduleWhatsAppPayloadFromVisit } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';
import {
	buildOdontogramDraft,
	canCancelOdontogramEntry,
	countOdontogramEntryFindings,
	countOdontogramMarkedTeeth,
	getDefaultOdontogramToothNumber,
	getOdontogramEntryStatus,
	getOdontogramEntrySummary,
	isOdontogramEntryCancelled,
	serializeOdontogramDraft,
	type OdontogramEntryDraft,
	type OdontogramSurfaceCode,
} from '../odontogram';
import { FinalizeVisitDialog } from './finalize-visit-dialog';
import { FinalizedVisitActions } from './finalized-visit-actions';
import { OdontogramChart } from './odontogram-chart';
import { OdontogramInspectorDialog, type OdontogramInspectorTarget } from './odontogram-inspector-dialog';
import { SectionStatusBadge } from './section-status-badge';
import { StickyVisitHeader } from './sticky-visit-header';

type OdontogramSheetPageProps = {
	visit: Visit;
	entries: OdontogramEntry[];
	loading: boolean;
	error: string | null;
	completedSections: number;
	allergyInfo: string;
	workspaceLocked: boolean;
	finalizeBlockers: string[];
	outcomeRecord: MedicalRecord | null;
	replaceEntries: (updater: (currentEntries: OdontogramEntry[]) => OdontogramEntry[]) => void;
	upsertEntry: (nextEntry: OdontogramEntry) => void;
	updateVisit: (updater: (currentVisit: Visit | null) => Visit | null) => void;
	onBack: () => void;
	onFinalizeVisit: (payload: FinalizeVisitPayload) => Promise<void>;
	onPrintControlLetter: () => Promise<void>;
	showControlLetter: boolean;
	printingControlLetter: boolean;
	onPrintMedicalResume: () => Promise<void>;
	printingMedicalResume: boolean;
	onCancelFinalization: () => Promise<void>;
	cancelingFinalization: boolean;
	prefetchedMonitorResult?: SatusehatVisitAutoSyncResult | null;
	prefetchedMonitorMessage?: string;
};

export function OdontogramSheetPage({
	visit,
	entries,
	loading,
	error,
	completedSections,
	allergyInfo,
	workspaceLocked,
	finalizeBlockers,
	outcomeRecord,
	replaceEntries,
	upsertEntry,
	updateVisit,
	onBack,
	onFinalizeVisit,
	onPrintControlLetter,
	showControlLetter,
	printingControlLetter,
	onPrintMedicalResume,
	printingMedicalResume,
	onCancelFinalization,
	cancelingFinalization,
	prefetchedMonitorResult,
	prefetchedMonitorMessage,
}: OdontogramSheetPageProps) {
	const { toast } = useToast();
	const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
	const [selectedToothNumber, setSelectedToothNumber] = useState<string>(getDefaultOdontogramToothNumber('permanent'));
	const [selectedSurfaceCode, setSelectedSurfaceCode] = useState<OdontogramSurfaceCode | null>(null);
	const [draft, setDraft] = useState<OdontogramEntryDraft>(buildOdontogramDraft());
	const [creating, setCreating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [inspectorTarget, setInspectorTarget] = useState<OdontogramInspectorTarget | null>(null);
	const [cancelTarget, setCancelTarget] = useState<OdontogramEntry | null>(null);
	const [canceling, setCanceling] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<OdontogramEntry | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const [saveNotesDraft, setSaveNotesDraft] = useState('');
	const [finalizeOpen, setFinalizeOpen] = useState(false);
	const [finalizing, setFinalizing] = useState(false);
	const [printing, setPrinting] = useState(false);

	const selectedEntry = useMemo(
		() => entries.find((entry) => entry.id === selectedEntryId) || entries[0] || null,
		[entries, selectedEntryId]
	);

	useEffect(() => {
		if (!selectedEntry) {
			setSelectedEntryId(null);
			return;
		}

		if (selectedEntry.id !== selectedEntryId) {
			setSelectedEntryId(selectedEntry.id);
		}
	}, [selectedEntry, selectedEntryId]);

	useEffect(() => {
		setDraft(buildOdontogramDraft(selectedEntry || undefined));
	}, [selectedEntry?.id, selectedEntry?.updated_at]);

	useEffect(() => {
		const currentTooth = draft.teeth.find((tooth) => tooth.tooth_number === selectedToothNumber);
		if (!currentTooth) {
			setSelectedToothNumber(getDefaultOdontogramToothNumber(draft.chart_type));
			setSelectedSurfaceCode(null);
			return;
		}

		if (selectedSurfaceCode && !currentTooth.surface_findings.some((surface) => surface.surface_code === selectedSurfaceCode)) {
			setSelectedSurfaceCode(currentTooth.surface_findings[0]?.surface_code || null);
		}
	}, [draft.teeth, selectedSurfaceCode, selectedToothNumber]);

	const baselinePayload = useMemo(
		() => JSON.stringify(serializeOdontogramDraft(buildOdontogramDraft(selectedEntry || undefined))),
		[selectedEntry?.id, selectedEntry?.updated_at]
	);
	const currentPayload = useMemo(() => JSON.stringify(serializeOdontogramDraft(draft)), [draft]);
	const hasUnsavedChanges = baselinePayload !== currentPayload;
	const controlWhatsAppPayload = useMemo(
		() => createControlScheduleWhatsAppPayloadFromVisit(visit, outcomeRecord),
		[outcomeRecord, visit]
	);
	const selectedTooth = draft.teeth.find((tooth) => tooth.tooth_number === selectedToothNumber) || draft.teeth[0] || null;
	const selectedEntryStatus = getOdontogramEntryStatus(selectedEntry, Boolean(workspaceLocked));
	const entryFindingCount = countOdontogramEntryFindings(draft);
	const entryMarkedTeeth = countOdontogramMarkedTeeth(draft);
	const readOnly = Boolean(workspaceLocked || selectedEntry?.status === 'cancelled' || selectedEntry?.status === 'final');

	const setWholeToothCondition = (toothNumber: string, condition: any) => {
		setDraft((currentDraft) => ({
			...currentDraft,
			teeth: currentDraft.teeth.map((tooth) => (tooth.tooth_number === toothNumber ? { ...tooth, tooth_condition: condition } : tooth)),
		}));
	};

	const setSurfaceCondition = (toothNumber: string, surfaceCode: OdontogramSurfaceCode, condition: any) => {
		setDraft((currentDraft) => ({
			...currentDraft,
			teeth: currentDraft.teeth.map((tooth) => {
				if (tooth.tooth_number !== toothNumber) {
					return tooth;
				}

				return {
					...tooth,
					surface_findings: tooth.surface_findings.map((surface) => (
						surface.surface_code === surfaceCode ? { ...surface, condition_code: condition } : surface
					)),
				};
			}),
		}));
	};

	const setToothNotes = (toothNumber: string, value: string) => {
		setDraft((currentDraft) => ({
			...currentDraft,
			teeth: currentDraft.teeth.map((tooth) => (tooth.tooth_number === toothNumber ? { ...tooth, notes: value } : tooth)),
		}));
	};

	const setSurfaceNotes = (toothNumber: string, surfaceCode: OdontogramSurfaceCode, value: string) => {
		setDraft((currentDraft) => ({
			...currentDraft,
			teeth: currentDraft.teeth.map((tooth) => {
				if (tooth.tooth_number !== toothNumber) {
					return tooth;
				}

				return {
					...tooth,
					surface_findings: tooth.surface_findings.map((surface) => (
						surface.surface_code === surfaceCode ? { ...surface, notes: value } : surface
					)),
				};
			}),
		}));
	};

	const createEntry = async () => {
		setCreating(true);
		try {
			const response = await odontogramApi.create({ visit_id: visit.id, chart_type: 'permanent' });
			const createdEntry = response.data.data;
			upsertEntry(createdEntry);
			setSelectedEntryId(createdEntry.id);
			setSelectedToothNumber(getDefaultOdontogramToothNumber(createdEntry.chart_type));
			setSelectedSurfaceCode(null);
			updateVisit((currentVisit) => currentVisit
				? { ...currentVisit, status: 'in_progress', queue_status: 'in_consultation' }
				: currentVisit);
			toast({ title: 'Entri odontogram berhasil dibuat' });
		} catch (requestError: any) {
			toast({ variant: 'destructive', title: 'Gagal membuat entri odontogram', description: requestError.response?.data?.error });
		} finally {
			setCreating(false);
		}
	};

	const saveEntry = async (draftToSave: OdontogramEntryDraft = draft) => {
		if (!selectedEntry) return false;

		setSaving(true);
		try {
			const response = await odontogramApi.update(selectedEntry.id, serializeOdontogramDraft(draftToSave));
			upsertEntry(response.data.data);
			toast({ title: 'Entri odontogram berhasil disimpan' });
			return true;
		} catch (requestError: any) {
			toast({ variant: 'destructive', title: 'Gagal menyimpan odontogram', description: requestError.response?.data?.error });
			return false;
		} finally {
			setSaving(false);
		}
	};

	const openSaveDialog = () => {
		if (!selectedEntry || readOnly || !hasUnsavedChanges) {
			return;
		}

		setSaveNotesDraft(draft.notes || '');
		setSaveDialogOpen(true);
	};

	const confirmSaveEntry = async () => {
		const nextDraft = { ...draft, notes: saveNotesDraft };
		setDraft(nextDraft);
		const saved = await saveEntry(nextDraft);
		if (saved) {
			setSaveDialogOpen(false);
		}
	};

	const cancelEntry = async () => {
		if (!cancelTarget) return;
		setCanceling(true);
		try {
			const response = await odontogramApi.cancel(cancelTarget.id);
			upsertEntry(response.data.data);
			setCancelTarget(null);
			toast({ title: 'Entri odontogram berhasil dibatalkan' });
		} catch (requestError: any) {
			toast({ variant: 'destructive', title: 'Gagal membatalkan entri odontogram', description: requestError.response?.data?.error });
		} finally {
			setCanceling(false);
		}
	};

	const deleteEntry = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			await odontogramApi.delete(deleteTarget.id);
			replaceEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== deleteTarget.id));
			setDeleteTarget(null);
			toast({ title: 'Entri odontogram berhasil dihapus' });
		} catch (requestError: any) {
			toast({ variant: 'destructive', title: 'Gagal menghapus entri odontogram', description: requestError.response?.data?.error });
		} finally {
			setDeleting(false);
		}
	};

	const finalizeVisit = async (payload: FinalizeVisitPayload) => {
		setFinalizing(true);
		try {
			if (hasUnsavedChanges) {
				const saved = await saveEntry(draft);
				if (!saved) return;
			}
			await onFinalizeVisit(payload);
			setFinalizeOpen(false);
		} finally {
			setFinalizing(false);
		}
	};

	const printEntry = async () => {
		if (!selectedEntry) return;
		const printWindow = window.open('', '_blank');
		if (!printWindow) {
			toast({ variant: 'destructive', title: 'Jendela cetak diblokir', description: 'Izinkan popup untuk membuka cetakan odontogram.' });
			return;
		}
		printWindow.document.write('<html><head><title>Menyiapkan cetakan odontogram...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan dokumen cetak odontogram...</body></html>');
		printWindow.document.close();
		setPrinting(true);
		try {
			const response = await odontogramApi.print(selectedEntry.id);
			const contentType = response.headers['content-type'] || 'application/pdf';
			const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
			const objectUrl = URL.createObjectURL(blob);
			printWindow.location.href = objectUrl;
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
		} catch (requestError: any) {
			printWindow.close();
			toast({ variant: 'destructive', title: 'Gagal mencetak odontogram', description: requestError.response?.data?.error || 'Terjadi kesalahan saat membuat PDF odontogram.' });
		} finally {
			setPrinting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4 p-4 lg:p-5">
				<div className="border border-border/70 bg-background px-5 py-8">
					<h1 className="text-lg font-semibold">Lembar odontogram tidak tersedia</h1>
					<p className="mt-2 text-sm text-muted-foreground">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col xl:overflow-hidden">
			<StickyVisitHeader
				visit={visit}
				completedSections={completedSections}
				isLocked={Boolean(workspaceLocked)}
				sticky
				sectionLabel="Odontogram"
				allergyInfo={allergyInfo}
				onBack={onBack}
				prefetchedMonitorResult={prefetchedMonitorResult}
				prefetchedMonitorMessage={prefetchedMonitorMessage}
				statusNote={selectedEntry ? (
					<span className={hasUnsavedChanges ? 'font-medium text-amber-700' : 'font-medium text-sky-700'}>
						{hasUnsavedChanges ? 'Perubahan odontogram belum disimpan' : selectedEntryStatus.label}
					</span>
				) : (
					<span className="text-muted-foreground">Belum ada entri odontogram</span>
				)}
				actions={!workspaceLocked ? (
					<Button className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" onClick={() => setFinalizeOpen(true)} title='Final Kunjungan'>
						<Lock className="h-4 w-4" />
					</Button>
				) : visit.status === 'completed' ? (
					<FinalizedVisitActions
						visitId={visit.id}
						showControlLetter={showControlLetter}
						controlWhatsAppPayload={controlWhatsAppPayload}
						onPrintControlLetter={onPrintControlLetter}
						printingControlLetter={printingControlLetter}
						onPrintMedicalResume={onPrintMedicalResume}
						printingMedicalResume={printingMedicalResume}
						onCancelFinalization={onCancelFinalization}
						cancelingFinalization={cancelingFinalization}
						buttonClassName="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
					/>
				) : undefined}
			/>

			<div className="flex flex-col gap-1.5 px-4 pb-4 pt-1.5 lg:px-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
				<div className="grid gap-0 border border-border/70 bg-background xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
					<aside className="border-b border-border/70 bg-background xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:border-b-0 xl:border-r xl:border-r-border/70">
						<div className="border-b border-border/70 px-3 py-3">
							<h2 className="text-sm font-semibold">Odontogram SVG</h2>
							<p className="mt-0.5 text-[11px] text-muted-foreground">Klik langsung pada permukaan gigi untuk membuka inspector permukaan, atau klik tanda whole tooth untuk membuka inspector gigi.</p>

							<div className="mt-3 grid grid-cols-2 gap-1.5">
								<Button variant="outline" className="gap-1.5 rounded-none shadow-none" onClick={createEntry} disabled={creating || workspaceLocked}>
									{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
									Tambah Entri
								</Button>
								<Button className="gap-1.5 rounded-none shadow-none" onClick={openSaveDialog} disabled={!selectedEntry || readOnly || saving || !hasUnsavedChanges}>
									{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
									Simpan Entri
								</Button>
							</div>
							{selectedEntry && (
								<div className="mt-1.5">
									<Button variant="outline" className="w-full gap-1.5 rounded-none shadow-none" onClick={printEntry} disabled={printing}>
										{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
										Cetak Odontogram
									</Button>
								</div>
							)}

							<p className="mt-3 text-[10px] leading-4 text-muted-foreground">Setiap entri menyimpan snapshot odontogram yang berbeda, sehingga Anda bisa membuat multi-entri dalam satu kunjungan.</p>
						</div>

						<div className="bg-background xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
							{entries.length === 0 ? (
								<div className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada entri odontogram untuk kunjungan ini.</div>
							) : (
								<div className="space-y-0">
									{entries.map((entry, index) => {
										const status = getOdontogramEntryStatus(entry, Boolean(workspaceLocked));
										const isActive = entry.id === selectedEntry?.id;
										return (
											<div
												key={entry.id}
												onClick={() => setSelectedEntryId(entry.id)}
												role="button"
												tabIndex={0}
												onKeyDown={(event) => {
													if (event.key === 'Enter' || event.key === ' ') {
														event.preventDefault();
														setSelectedEntryId(entry.id);
													}
												}}
												className={cn('border-b border-border/60 px-2.5 py-2 text-left transition hover:bg-muted/20', isActive && 'bg-muted/20 [box-shadow:inset_2px_0_0_0_hsl(var(--foreground))]')}
											>
												<div className="flex items-start gap-2">
													<div className="w-8 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">#{entries.length - index}</div>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
															<span className="truncate">{new Date(entry.updated_at || entry.created_at || '').toLocaleString('id-ID')}</span>
															<SectionStatusBadge label={status.label} tone={status.tone} />
														</div>
														<p className="mt-1 line-clamp-2 whitespace-normal break-words text-[12px] leading-4 text-foreground/90">{getOdontogramEntrySummary(entry)}</p>
													</div>
													<div className="flex shrink-0 items-start gap-0.5 pt-0.5">
														{canCancelOdontogramEntry(entry, Boolean(workspaceLocked)) && (
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-5 w-5 rounded-none p-0 text-amber-700 hover:bg-transparent hover:text-amber-800"
																onClick={(event) => {
																	event.stopPropagation();
																	setCancelTarget(entry);
																}}
															>
																<CircleX className="h-3.5 w-3.5" />
															</Button>
														)}
														{isOdontogramEntryCancelled(entry) && !workspaceLocked && (
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-5 w-5 rounded-none p-0 text-destructive hover:bg-transparent hover:text-destructive"
																onClick={(event) => {
																	event.stopPropagation();
																	setDeleteTarget(entry);
																}}
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														)}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</aside>

					<main className="min-w-0 bg-background xl:h-full xl:min-h-0 xl:overflow-hidden">
						<div className="space-y-4 px-3 py-3 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:[scrollbar-gutter:stable]">
							{selectedEntry ? (
								<>
									<section className="border border-border/70 bg-background">
										<div className="border-b border-border/70 px-3 py-2.5">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div>
													<h3 className="text-[13px] font-semibold tracking-tight">Odontogram</h3>
												</div>
												<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
													<SectionStatusBadge label={selectedEntryStatus.label} tone={selectedEntryStatus.tone} />
													<span>{entryFindingCount} temuan</span>
													<span>•</span>
													<span>{entryMarkedTeeth} gigi bertanda</span>
												</div>
											</div>
										</div>

										<div className="space-y-3 p-3">
												<OdontogramChart
													draft={draft}
													readOnly={readOnly}
													selectedToothNumber={selectedTooth?.tooth_number || null}
													selectedSurfaceCode={selectedSurfaceCode}
													selectionMode="editor"
													showToothSelectionIndicator={false}
													onSelectTooth={setSelectedToothNumber}
													onSelectSurface={(toothNumber, surfaceCode) => {
														setSelectedToothNumber(toothNumber);
														setSelectedSurfaceCode(surfaceCode);
													}}
													onOpenInspector={(target) => {
														setSelectedToothNumber(target.toothNumber);
														setSelectedSurfaceCode(target.surfaceCode);
														setInspectorTarget(target);
													}}
												/>
										</div>
									</section>
								</>
							) : (
								<section className="border border-dashed border-border/70 bg-background px-5 py-12 text-center text-sm text-muted-foreground">
									Belum ada entri odontogram. Buat entri baru untuk mulai menandai gigi dan permukaan pada chart SVG.
								</section>
							)}
						</div>
					</main>
				</div>
			</div>

			<Dialog open={saveDialogOpen} onOpenChange={(open) => (!saving ? setSaveDialogOpen(open) : undefined)}>
				<DialogContent className="w-[min(560px,calc(100vw-24px))] rounded-none border-border/70 p-0">
					<div className="border-b border-border/70 px-4 py-3">
						<DialogHeader className="space-y-1 text-left">
							<DialogTitle className="text-lg font-semibold tracking-tight">Simpan Entri Odontogram</DialogTitle>
							<DialogDescription className="text-sm text-muted-foreground">
								Catatan entry tidak lagi tampil di sheet. Isi ringkasan singkat di sini sebelum menyimpan jika memang diperlukan.
							</DialogDescription>
						</DialogHeader>
					</div>

					<div className="space-y-2 px-4 py-3">
						<div className="space-y-1.5">
							<div className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Catatan Entri</div>
							<Textarea
								value={saveNotesDraft}
								onChange={(event) => setSaveNotesDraft(event.target.value)}
								disabled={readOnly || saving}
								rows={4}
								placeholder="Ringkasan entry odontogram ini, misalnya kontrol karies multipel, evaluasi pasca tindakan, atau progres sebelum tindakan lanjutan."
								className="rounded-none resize-none"
							/>
						</div>
					</div>

					<DialogFooter className="border-t border-border/70 px-4 py-3">
						<Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => setSaveDialogOpen(false)} disabled={saving}>
							Batal
						</Button>
						<Button type="button" className="gap-1.5 rounded-none shadow-none" onClick={confirmSaveEntry} disabled={saving || !selectedEntry}>
							{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							Simpan Entri
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={Boolean(cancelTarget)}
				onOpenChange={(open) => {
					if (!open) setCancelTarget(null);
				}}
				onConfirm={cancelEntry}
				title="Batalkan Entri Odontogram"
				description="Entri odontogram akan ditandai batal. Setelah itu, entri masih terlihat di timeline dan baru bisa dihapus jika memang tidak dipakai."
				confirmText={canceling ? 'Membatalkan...' : 'Batalkan Entri'}
				cancelText="Tutup"
			/>

			<ConfirmDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				onConfirm={deleteEntry}
				title="Hapus Entri Odontogram"
				description="Entri odontogram yang dibatalkan akan dihapus permanen dari kunjungan ini. Tindakan ini tidak bisa dibatalkan."
				confirmText={deleting ? 'Menghapus...' : 'Hapus Entri'}
				cancelText="Tutup"
			/>

			<FinalizeVisitDialog
				open={finalizeOpen}
				onOpenChange={setFinalizeOpen}
				outcomeRecord={outcomeRecord}
				blockers={finalizeBlockers}
				submitting={finalizing}
				onSubmit={finalizeVisit}
			/>

			<OdontogramInspectorDialog
				open={Boolean(inspectorTarget)}
				target={inspectorTarget}
				draft={draft}
				readOnly={readOnly}
				onOpenChange={(open) => {
					if (!open) {
						setInspectorTarget(null);
					}
				}}
				onSetWholeToothCondition={setWholeToothCondition}
				onSetSurfaceCondition={setSurfaceCondition}
				onSetToothNotes={(toothNumber, value) => {
					setSelectedToothNumber(toothNumber);
					setToothNotes(toothNumber, value);
				}}
				onSetSurfaceNotes={(toothNumber, surfaceCode, value) => {
					setSelectedToothNumber(toothNumber);
					setSelectedSurfaceCode(surfaceCode);
					setSurfaceNotes(toothNumber, surfaceCode, value);
				}}
			/>
		</div>
	);
}