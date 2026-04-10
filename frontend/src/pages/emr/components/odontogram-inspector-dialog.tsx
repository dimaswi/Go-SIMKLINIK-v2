import type { OdontogramSurfaceCondition, OdontogramToothCondition } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
	ODONTOGRAM_SURFACE_LABELS,
	ODONTOGRAM_SURFACE_OPTIONS,
	ODONTOGRAM_WHOLE_TOOTH_OPTIONS,
	getOdontogramToothDefinition,
	getSurfaceConditionOption,
	getWholeToothOption,
	type OdontogramEntryDraft,
	type OdontogramSurfaceCode,
} from '../odontogram';

export type OdontogramInspectorTarget = {
	toothNumber: string;
	surfaceCode: OdontogramSurfaceCode | null;
};

type OdontogramInspectorDialogProps = {
	open: boolean;
	target: OdontogramInspectorTarget | null;
	draft: OdontogramEntryDraft;
	readOnly: boolean;
	onOpenChange: (open: boolean) => void;
	onSetWholeToothCondition: (toothNumber: string, condition: OdontogramToothCondition) => void;
	onSetSurfaceCondition: (toothNumber: string, surfaceCode: OdontogramSurfaceCode, condition: OdontogramSurfaceCondition) => void;
	onSetToothNotes: (toothNumber: string, notes: string) => void;
	onSetSurfaceNotes: (toothNumber: string, surfaceCode: OdontogramSurfaceCode, notes: string) => void;
};

const WHOLE_TOOTH_INDICATORS: Record<OdontogramToothCondition, { code: string; className: string }> = {
	sound: { code: 'N', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
	missing: { code: 'MIS', className: 'border-slate-200 bg-slate-100 text-slate-700' },
	extracted: { code: 'EXT', className: 'border-rose-200 bg-rose-50 text-rose-700' },
	retained_root: { code: 'RAR', className: 'border-amber-200 bg-amber-50 text-amber-700' },
	impacted: { code: 'IMP', className: 'border-violet-200 bg-violet-50 text-violet-700' },
	implant: { code: 'IPL', className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
	crown: { code: 'CRN', className: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
	mobility: { code: 'MOB', className: 'border-orange-200 bg-orange-50 text-orange-700' },
};

function getWholeToothIndicator(condition: OdontogramToothCondition) {
	return WHOLE_TOOTH_INDICATORS[condition] || WHOLE_TOOTH_INDICATORS.sound;
}

export function OdontogramInspectorDialog({
	open,
	target,
	draft,
	readOnly,
	onOpenChange,
	onSetWholeToothCondition,
	onSetSurfaceCondition,
	onSetToothNotes,
	onSetSurfaceNotes,
}: OdontogramInspectorDialogProps) {
	const tooth = target ? draft.teeth.find((item) => item.tooth_number === target.toothNumber) || null : null;
	const toothDefinition = target ? getOdontogramToothDefinition(target.toothNumber) : null;

	if (!target || !tooth || !toothDefinition) {
		return null;
	}

	const currentWholeToothOption = getWholeToothOption(tooth.tooth_condition);
	const currentWholeToothIndicator = getWholeToothIndicator(tooth.tooth_condition as OdontogramToothCondition);
	const activeSurface = target.surfaceCode
		? tooth.surface_findings.find((item) => item.surface_code === target.surfaceCode) || null
		: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[min(900px,calc(100vw-20px))] max-w-4xl overflow-hidden rounded-none border-border/70 p-0 [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4">
				<div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] px-3 py-3 sm:px-4 sm:py-3.5">
					<DialogHeader className="space-y-1.5 text-left">
						<div className="flex flex-wrap gap-1.5">
							<span className="border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground">FDI {target.toothNumber}</span>
							<span className="border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground">{toothDefinition.toothKind === 'anterior' ? 'Anterior' : 'Posterior'}</span>
							{target.surfaceCode ? (
								<span className="border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground">Permukaan {ODONTOGRAM_SURFACE_LABELS[target.surfaceCode]}</span>
							) : (
								<span className="border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground">Fokus gigi penuh</span>
							)}
							<span className={cn('inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]', currentWholeToothOption.badgeClassName)}>
								<span className={cn('inline-flex min-w-7 justify-center border px-1.5 py-0.5 text-[10px] font-bold', currentWholeToothIndicator.className)}>
									{currentWholeToothIndicator.code}
								</span>
								{currentWholeToothOption.label}
							</span>
						</div>
					</DialogHeader>
				</div>

				<div className="space-y-2.5 px-3 py-3 sm:px-4 sm:py-3">
					<section className="space-y-2 border border-border/70 bg-muted/10 p-2.5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h3 className="text-sm font-semibold tracking-tight">Whole Tooth</h3>
							</div>
							<span className={cn('inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', currentWholeToothOption.badgeClassName)}>
								<span className={cn('inline-flex min-w-7 justify-center border px-1.5 py-0.5 text-[10px] font-bold', currentWholeToothIndicator.className)}>
									{currentWholeToothIndicator.code}
								</span>
								{currentWholeToothOption.label}
							</span>
						</div>

						<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
							{ODONTOGRAM_WHOLE_TOOTH_OPTIONS.map((option) => {
								const indicator = getWholeToothIndicator(option.value);
								const selected = tooth.tooth_condition === option.value;
								return (
									<button
										key={option.value}
										type="button"
										disabled={readOnly}
										onClick={() => onSetWholeToothCondition(target.toothNumber, option.value)}
										className={cn(
											'flex items-center gap-2 border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
											selected ? 'border-foreground/40 bg-background shadow-sm' : 'border-border/70 bg-background hover:bg-muted/20'
										)}
									>
										<span className={cn('inline-flex h-7 min-w-7 items-center justify-center border text-[10px] font-bold uppercase', indicator.className)}>
											{indicator.code}
										</span>
										<div className="min-w-0">
											<div className="truncate text-[11px] font-semibold text-foreground/90">{option.label}</div>
										</div>
									</button>
								);
							})}
						</div>
					</section>

					{target.surfaceCode && (
						<section className="space-y-2 border border-border/70 bg-muted/10 p-2.5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<h3 className="text-sm font-semibold tracking-tight">Bagian Gigi {ODONTOGRAM_SURFACE_LABELS[target.surfaceCode]}</h3>
								</div>
								<span className="inline-flex items-center gap-2 border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
									<span className="h-3.5 w-3.5 border" style={{ backgroundColor: getSurfaceConditionOption(activeSurface?.condition_code || 'sound').fill, borderColor: getSurfaceConditionOption(activeSurface?.condition_code || 'sound').stroke }} />
									{getSurfaceConditionOption(activeSurface?.condition_code || 'sound').label}
								</span>
							</div>

							<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
								{ODONTOGRAM_SURFACE_OPTIONS.map((option) => {
									const selected = activeSurface?.condition_code === option.value;
									return (
										<button
											key={option.value}
											type="button"
											disabled={readOnly}
											onClick={() => onSetSurfaceCondition(target.toothNumber, target.surfaceCode!, option.value)}
											className={cn(
												'flex items-center gap-2 border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
												selected ? 'border-foreground/40 bg-background shadow-sm' : 'border-border/70 bg-background hover:bg-muted/20'
											)}
										>
											<span className="inline-flex h-7 min-w-7 items-center justify-center border text-[10px] font-bold uppercase" style={{ backgroundColor: option.fill, borderColor: option.stroke, color: option.stroke }}>
												{option.shortLabel}
											</span>
											<div className="min-w-0">
												<div className="truncate text-[11px] font-semibold text-foreground/90">{option.label}</div>
											</div>
										</button>
									);
								})}
							</div>
						</section>
					)}

					<section className="space-y-2 border border-border/70 bg-muted/10 p-2.5">
						<h3 className="text-sm font-semibold tracking-tight">Catatan Klinis</h3>
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">Catatan Gigi {target.toothNumber}</Label>
							<Textarea
								value={tooth.notes}
								onChange={(event) => onSetToothNotes(target.toothNumber, event.target.value)}
								disabled={readOnly}
								rows={1}
								placeholder="Contoh: mobilitas, abses, perlu evaluasi lanjutan."
								className="min-h-[56px] rounded-none resize-none py-2"
							/>
						</div>

						{target.surfaceCode && (
							<div className="space-y-1.5">
								<Label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">Catatan Permukaan {target.surfaceCode.toUpperCase()}</Label>
								<Textarea
									value={activeSurface?.notes || ''}
									onChange={(event) => onSetSurfaceNotes(target.toothNumber, target.surfaceCode!, event.target.value)}
									disabled={readOnly}
									rows={1}
									placeholder="Contoh: karies dentin, fraktur kecil, atau kalkulus."
									className="min-h-[56px] rounded-none resize-none py-2"
								/>
							</div>
						)}
					</section>
				</div>

				<DialogFooter className="border-t border-border/70 px-3 py-2.5 sm:px-4">
					<Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => onOpenChange(false)}>
						Tutup Inspector
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}