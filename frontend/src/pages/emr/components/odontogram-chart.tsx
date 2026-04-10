import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
	ODONTOGRAM_SURFACE_LABELS,
	ODONTOGRAM_SURFACE_OPTIONS,
	getOdontogramChartTitle,
	getOdontogramToothDefinitions,
	getSurfaceConditionOption,
	getWholeToothOption,
	type OdontogramEntryDraft,
	type OdontogramSurfaceCode,
} from '../odontogram';
import type { OdontogramInspectorTarget } from './odontogram-inspector-dialog';

type OdontogramChartProps = {
	draft: OdontogramEntryDraft;
	readOnly: boolean;
	selectedToothNumber: string | null;
	selectedSurfaceCode: OdontogramSurfaceCode | null;
	selectedSurfaceCodes?: OdontogramSurfaceCode[];
	selectionMode?: 'editor' | 'target-picker';
	showToothSelectionIndicator?: boolean;
	showSelectionSummary?: boolean;
	onSelectTooth: (toothNumber: string) => void;
	onSelectSurface: (toothNumber: string, surfaceCode: OdontogramSurfaceCode) => void;
	onOpenInspector?: (target: OdontogramInspectorTarget) => void;
};

type HoveredSurfaceState = {
	toothNumber: string;
	surfaceCode: OdontogramSurfaceCode;
};

const TOOTH_CONDITION_SHORT_LABELS: Record<string, string> = {
	missing: 'MIS',
	extracted: 'EXT',
	retained_root: 'RAR',
	impacted: 'IMP',
	implant: 'IMP-L',
	crown: 'CRN',
	mobility: 'MOB',
};

const TOOTH_INNER_START = 16;
const TOOTH_INNER_END = 32;
const TOOTH_OUTER_START = 2;
const TOOTH_OUTER_END = 46;
const TOOTH_STEP_X = 44;

const ANT_CX_L = 16;
const ANT_CX_R = 32;
const ANT_CY = 24;

const SELECTION_STYLES = {
	editor: {
		labelClassName: 'fill-sky-700',
		toothStroke: '#0284c7',
		toothFill: 'rgba(14, 165, 233, 0.14)',
		surfaceFill: 'rgba(14, 165, 233, 0.22)',
		summaryBorderClassName: 'border-sky-300',
		summaryBackgroundClassName: 'bg-sky-50/90',
		summaryTextClassName: 'text-sky-950',
		summaryBadgeBorderClassName: 'border-sky-500',
		summaryBadgeBackgroundClassName: 'bg-sky-600',
		summaryBadgeTextClassName: 'text-white',
		summaryChipBorderClassName: 'border-sky-300',
		summaryChipTextClassName: 'text-sky-900',
		summaryMutedTextClassName: 'text-sky-900/80',
		summaryBadgeLabel: 'Editor Aktif',
	},
		'target-picker': {
		labelClassName: 'fill-amber-700',
		toothStroke: '#d97706',
		toothFill: 'rgba(245, 158, 11, 0.16)',
		surfaceFill: 'rgba(245, 158, 11, 0.28)',
		summaryBorderClassName: 'border-amber-300',
		summaryBackgroundClassName: 'bg-amber-50/90',
		summaryTextClassName: 'text-amber-950',
		summaryBadgeBorderClassName: 'border-amber-500',
		summaryBadgeBackgroundClassName: 'bg-amber-600',
		summaryBadgeTextClassName: 'text-white',
		summaryChipBorderClassName: 'border-amber-300',
		summaryChipTextClassName: 'text-amber-900',
		summaryMutedTextClassName: 'text-amber-900/80',
		summaryBadgeLabel: 'Target Aktif',
	},
} as const;

function getRowStartX(totalWidth: number, count: number) {
	return Math.round((totalWidth - ((count - 1) * TOOTH_STEP_X + 48)) / 2);
}

function getPosteriorSurfacePath(surfaceCode: OdontogramSurfaceCode) {
	switch (surfaceCode) {
		case 'mesial':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_START} L ${TOOTH_INNER_START} ${TOOTH_INNER_START} L ${TOOTH_INNER_START} ${TOOTH_INNER_END} L ${TOOTH_OUTER_START} ${TOOTH_OUTER_END} Z`;
		case 'distal':
			return `M ${TOOTH_OUTER_END} ${TOOTH_OUTER_START} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_END} L ${TOOTH_INNER_END} ${TOOTH_INNER_END} L ${TOOTH_INNER_END} ${TOOTH_INNER_START} Z`;
		case 'buccal':
		case 'labial':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_START} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_START} L ${TOOTH_INNER_END} ${TOOTH_INNER_START} L ${TOOTH_INNER_START} ${TOOTH_INNER_START} Z`;
		case 'lingual':
		case 'palatal':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_END} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_END} L ${TOOTH_INNER_END} ${TOOTH_INNER_END} L ${TOOTH_INNER_START} ${TOOTH_INNER_END} Z`;
		case 'occlusal':
		case 'incisal':
		default:
			return `M ${TOOTH_INNER_START} ${TOOTH_INNER_START} L ${TOOTH_INNER_END} ${TOOTH_INNER_START} L ${TOOTH_INNER_END} ${TOOTH_INNER_END} L ${TOOTH_INNER_START} ${TOOTH_INNER_END} Z`;
	}
}

function getAnteriorSurfacePath(surfaceCode: OdontogramSurfaceCode) {
	switch (surfaceCode) {
		case 'mesial':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_START} L ${ANT_CX_L} ${ANT_CY} L ${TOOTH_OUTER_START} ${TOOTH_OUTER_END} Z`;
		case 'distal':
			return `M ${TOOTH_OUTER_END} ${TOOTH_OUTER_START} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_END} L ${ANT_CX_R} ${ANT_CY} Z`;
		case 'labial':
		case 'buccal':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_START} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_START} L ${ANT_CX_R} ${ANT_CY} L ${ANT_CX_L} ${ANT_CY} Z`;
		case 'lingual':
		case 'palatal':
			return `M ${TOOTH_OUTER_START} ${TOOTH_OUTER_END} L ${ANT_CX_L} ${ANT_CY} L ${ANT_CX_R} ${ANT_CY} L ${TOOTH_OUTER_END} ${TOOTH_OUTER_END} Z`;
		case 'incisal':
		case 'occlusal':
		default:
			return `M ${TOOTH_INNER_START} ${ANT_CY - 4} L ${TOOTH_INNER_END} ${ANT_CY - 4} L ${TOOTH_INNER_END - 3} ${ANT_CY + 4} L ${TOOTH_INNER_START + 3} ${ANT_CY + 4} Z`;
	}
}

function getSurfacePath(surfaceCode: OdontogramSurfaceCode, toothKind: 'anterior' | 'posterior') {
	return toothKind === 'anterior' ? getAnteriorSurfacePath(surfaceCode) : getPosteriorSurfacePath(surfaceCode);
}

function renderPosteriorToothOutline() {
	return (
		<g stroke="#111827" strokeWidth={1.7} fill="none" strokeLinejoin="miter">
			<rect x={TOOTH_OUTER_START} y={TOOTH_OUTER_START} width={TOOTH_OUTER_END - TOOTH_OUTER_START} height={TOOTH_OUTER_END - TOOTH_OUTER_START} />
			<rect x={TOOTH_INNER_START} y={TOOTH_INNER_START} width={TOOTH_INNER_END - TOOTH_INNER_START} height={TOOTH_INNER_END - TOOTH_INNER_START} />
			<line x1={TOOTH_OUTER_START} y1={TOOTH_OUTER_START} x2={TOOTH_INNER_START} y2={TOOTH_INNER_START} />
			<line x1={TOOTH_OUTER_END} y1={TOOTH_OUTER_START} x2={TOOTH_INNER_END} y2={TOOTH_INNER_START} />
			<line x1={TOOTH_OUTER_START} y1={TOOTH_OUTER_END} x2={TOOTH_INNER_START} y2={TOOTH_INNER_END} />
			<line x1={TOOTH_OUTER_END} y1={TOOTH_OUTER_END} x2={TOOTH_INNER_END} y2={TOOTH_INNER_END} />
		</g>
	);
}

function renderAnteriorToothOutline() {
	return (
		<g stroke="#111827" strokeWidth={1.7} fill="none" strokeLinejoin="miter">
			<rect x={TOOTH_OUTER_START} y={TOOTH_OUTER_START} width={TOOTH_OUTER_END - TOOTH_OUTER_START} height={TOOTH_OUTER_END - TOOTH_OUTER_START} />
			<line x1={TOOTH_OUTER_START} y1={TOOTH_OUTER_START} x2={ANT_CX_L} y2={ANT_CY} />
			<line x1={TOOTH_OUTER_END} y1={TOOTH_OUTER_START} x2={ANT_CX_R} y2={ANT_CY} />
			<line x1={TOOTH_OUTER_START} y1={TOOTH_OUTER_END} x2={ANT_CX_L} y2={ANT_CY} />
			<line x1={TOOTH_OUTER_END} y1={TOOTH_OUTER_END} x2={ANT_CX_R} y2={ANT_CY} />
			<line x1={ANT_CX_L} y1={ANT_CY} x2={ANT_CX_R} y2={ANT_CY} />
		</g>
	);
}

function renderToothOutline(toothKind: 'anterior' | 'posterior') {
	return toothKind === 'anterior' ? renderAnteriorToothOutline() : renderPosteriorToothOutline();
}

function renderToothOverlay(condition: string) {
	if (condition === 'missing' || condition === 'extracted') {
		const stroke = condition === 'extracted' ? '#dc2626' : '#64748b';
		return (
			<g stroke={stroke} strokeWidth={2.4} strokeLinecap="round">
				<line x1={6} y1={6} x2={42} y2={42} />
				<line x1={42} y1={6} x2={6} y2={42} />
			</g>
		);
	}

	if (condition === 'implant') {
		return (
			<g stroke="#0891b2" strokeWidth={1.8} fill="none" strokeLinecap="round">
				<circle cx={24} cy={22} r={6.5} />
				<line x1={24} y1={28.5} x2={24} y2={37} />
				<line x1={18.5} y1={34.5} x2={29.5} y2={34.5} />
			</g>
		);
	}

	if (condition === 'retained_root') {
		return <line x1={14} y1={35} x2={34} y2={35} stroke="#b45309" strokeWidth={2.4} strokeLinecap="round" />;
	}

	if (condition === 'impacted') {
		return <path d="M 7 42 L 41 8" stroke="#7c3aed" strokeWidth={2.4} strokeDasharray="4 3" strokeLinecap="round" fill="none" />;
	}

	if (condition === 'mobility') {
		return <path d="M 8 40 C 16 31, 32 47, 40 40" stroke="#ea580c" strokeWidth={2.4} strokeLinecap="round" fill="none" />;
	}

	if (condition === 'crown') {
		return <rect x={9} y={9} width={30} height={30} rx={4} fill="none" stroke="#ca8a04" strokeWidth={2.2} />;
	}

	return null;
}

export function OdontogramChart({
	draft,
	readOnly,
	selectedToothNumber,
	selectedSurfaceCode,
	selectedSurfaceCodes,
	selectionMode = 'editor',
	showToothSelectionIndicator = true,
	showSelectionSummary = false,
	onSelectTooth,
	onSelectSurface,
	onOpenInspector,
}: OdontogramChartProps) {
	const selectionStyle = SELECTION_STYLES[selectionMode];
	const toothMap = useMemo(() => new Map(draft.teeth.map((tooth) => [tooth.tooth_number, tooth])), [draft.teeth]);
	const toothDefinitions = useMemo(() => getOdontogramToothDefinitions(draft.chart_type), [draft.chart_type]);
	const highlightedSurfaceCodes = useMemo(() => {
		if (selectedSurfaceCodes !== undefined) {
			return new Set<OdontogramSurfaceCode>(selectedSurfaceCodes);
		}

		const nextCodes = new Set<OdontogramSurfaceCode>();
		if (selectedSurfaceCode) {
			nextCodes.add(selectedSurfaceCode);
		}
		return nextCodes;
	}, [selectedSurfaceCode, selectedSurfaceCodes]);
	const selectedSurfaceLabels = useMemo(
		() => Array.from(highlightedSurfaceCodes).map((surfaceCode) => ODONTOGRAM_SURFACE_LABELS[surfaceCode] || surfaceCode),
		[highlightedSurfaceCodes]
	);
	const [hoveredSurface, setHoveredSurface] = useState<HoveredSurfaceState | null>(null);
	const chartWidth = 930;
	const chartHeight = 430;
	const permanentStartX = getRowStartX(chartWidth, 16);
	const primaryStartX = getRowStartX(chartWidth, 10);

	return (
		<div className="space-y-3">
			<div className="overflow-x-auto border border-border/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.85),rgba(255,255,255,1))] p-3" onMouseLeave={() => setHoveredSurface(null)}>
				<svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-auto min-w-[820px] w-full" role="img" aria-label="Odontogram SVG interaktif standar">
					<text x={chartWidth / 2} y={18} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{getOdontogramChartTitle(draft.chart_type)}</text>
					{toothDefinitions.map((definition) => {
						const tooth = toothMap.get(definition.toothNumber);
						const condition = tooth?.tooth_condition || 'sound';
						const conditionMeta = getWholeToothOption(condition);
						const rowY = definition.row === 'permanent_upper'
							? 44
							: definition.row === 'primary_upper'
								? 142
								: definition.row === 'primary_lower'
									? 240
									: 338;
						const rowStartX = definition.row === 'permanent_upper' || definition.row === 'permanent_lower' ? permanentStartX : primaryStartX;
						const x = rowStartX + definition.position * TOOTH_STEP_X;
						const labelY = definition.row === 'permanent_upper' || definition.row === 'primary_upper' ? rowY - 10 : rowY + 62;
						const selected = selectedToothNumber === definition.toothNumber;
						const selectedTooth = tooth || { tooth_number: definition.toothNumber, tooth_condition: 'sound', notes: '', surface_findings: [] };

						return (
							<g key={definition.toothNumber} transform={`translate(${x}, ${rowY})`}>
								{selected && showToothSelectionIndicator && (
									<rect
										x={-5}
										y={-5}
										width={58}
										height={58}
										rx={8}
										fill={selectionStyle.toothFill}
										stroke={selectionStyle.toothStroke}
										strokeWidth={1.8}
										strokeDasharray="5 3"
										pointerEvents="none"
									/>
								)}
								<text
									x={24}
									y={labelY - rowY}
									textAnchor="middle"
									onClick={() => {
										onSelectTooth(definition.toothNumber);
										if (!readOnly) {
											onOpenInspector?.({ toothNumber: definition.toothNumber, surfaceCode: null });
										}
									}}
									className={cn(
										'text-[10px] font-semibold',
										selected ? selectionStyle.labelClassName : 'fill-muted-foreground',
										readOnly ? 'cursor-default' : 'cursor-pointer'
									)}
								>
									{definition.label}
								</text>
								{definition.surfaceCodes.map((surfaceCode) => {
									const surface = selectedTooth.surface_findings.find((item) => item.surface_code === surfaceCode);
									const surfaceMeta = getSurfaceConditionOption(surface?.condition_code || 'sound');
									const isSelectedSurface = selected && highlightedSurfaceCodes.has(surfaceCode);
									const isHoveredSurface = hoveredSurface?.toothNumber === definition.toothNumber && hoveredSurface.surfaceCode === surfaceCode;
									return (
										<g key={`${definition.toothNumber}-${surfaceCode}`}>
											<path
												d={getSurfacePath(surfaceCode, definition.toothKind)}
												fill={surfaceMeta.fill}
												stroke={isSelectedSurface ? '#0f172a' : 'transparent'}
												strokeWidth={isSelectedSurface ? 2.2 : 0}
												onClick={() => {
													onSelectTooth(definition.toothNumber);
													onSelectSurface(definition.toothNumber, surfaceCode);
													if (!readOnly) {
														onOpenInspector?.({ toothNumber: definition.toothNumber, surfaceCode });
													}
												}}
												onMouseEnter={() => setHoveredSurface({ toothNumber: definition.toothNumber, surfaceCode })}
												onMouseLeave={() => setHoveredSurface((current) => (
													current?.toothNumber === definition.toothNumber && current.surfaceCode === surfaceCode ? null : current
												))}
												className={cn('cursor-pointer transition-opacity', readOnly ? 'cursor-default' : 'hover:opacity-95')}
											/>
											{isSelectedSurface && (
												<path
													d={getSurfacePath(surfaceCode, definition.toothKind)}
													fill={selectionStyle.surfaceFill}
													stroke={selectionStyle.toothStroke}
													strokeWidth={2.4}
													pointerEvents="none"
												/>
											)}
											{isHoveredSurface && (
												<path d={getSurfacePath(surfaceCode, definition.toothKind)} fill="rgba(15,23,42,0.28)" pointerEvents="none" />
											)}
										</g>
									);
								})}
								{renderToothOutline(definition.toothKind)}
								<g
									onClick={() => {
										onSelectTooth(definition.toothNumber);
										if (!readOnly) {
											onOpenInspector?.({ toothNumber: definition.toothNumber, surfaceCode: null });
										}
									}}
									className={cn('cursor-pointer', readOnly && 'cursor-default')}
								>
									{renderToothOverlay(condition)}
								</g>
								{condition !== 'sound' && (
									<g
										onClick={() => {
											onSelectTooth(definition.toothNumber);
											if (!readOnly) {
												onOpenInspector?.({ toothNumber: definition.toothNumber, surfaceCode: null });
											}
										}}
										className={cn(readOnly ? 'cursor-default' : 'cursor-pointer')}
									>
										<rect x={2} y={53} width={44} height={12} fill="white" stroke={conditionMeta.badgeClassName.includes('rose') ? '#fb7185' : conditionMeta.badgeClassName.includes('amber') ? '#f59e0b' : conditionMeta.badgeClassName.includes('violet') ? '#a78bfa' : conditionMeta.badgeClassName.includes('cyan') ? '#22d3ee' : conditionMeta.badgeClassName.includes('yellow') ? '#facc15' : conditionMeta.badgeClassName.includes('orange') ? '#fb923c' : '#94a3b8'} />
										<text x={24} y={62} textAnchor="middle" className="fill-foreground text-[8px] font-semibold">
											{TOOTH_CONDITION_SHORT_LABELS[condition] || condition.toUpperCase()}
										</text>
									</g>
								)}
								{selected && showToothSelectionIndicator && (
									<g pointerEvents="none">
										<rect x={6} y={-22} width={36} height={12} rx={3} fill={selectionStyle.toothStroke} />
										<text x={24} y={-13} textAnchor="middle" className="fill-white text-[8px] font-bold uppercase tracking-[0.14em]">
											Pilih
										</text>
									</g>
								)}
							</g>
						);
					})}
				</svg>
				{showSelectionSummary && selectedToothNumber && (
					<div className={cn('mt-3 flex flex-wrap items-center gap-2 border px-3 py-2 text-xs', selectionStyle.summaryBorderClassName, selectionStyle.summaryBackgroundClassName, selectionStyle.summaryTextClassName)}>
						<span className={cn('inline-flex items-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', selectionStyle.summaryBadgeBorderClassName, selectionStyle.summaryBadgeBackgroundClassName, selectionStyle.summaryBadgeTextClassName)}>
							{selectionStyle.summaryBadgeLabel}
						</span>
						<span className="font-medium">Gigi {selectedToothNumber}</span>
						{selectedSurfaceLabels.length > 0 ? (
							selectedSurfaceLabels.map((label) => (
								<span key={label} className={cn('inline-flex items-center border bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', selectionStyle.summaryChipBorderClassName, selectionStyle.summaryChipTextClassName)}>
									{label}
								</span>
							))
						) : (
							<span className={selectionStyle.summaryMutedTextClassName}>Belum ada bagian gigi dipilih.</span>
						)}
					</div>
				)}
				<div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
					{ODONTOGRAM_SURFACE_OPTIONS.filter((option) => option.value !== 'sound').map((option) => (
						<div key={option.value} className="inline-flex items-center gap-1.5 border border-border/60 bg-background px-2 py-1">
							<span className="h-3 w-3 border" style={{ backgroundColor: option.fill, borderColor: option.stroke }} />
							{option.label}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}