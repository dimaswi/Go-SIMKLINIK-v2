import type {
	OdontogramChartType,
	OdontogramEntry,
	OdontogramEntryStatus,
	OdontogramSurfaceCondition,
	OdontogramToothCondition,
} from '@/lib/api';

export type OdontogramSurfaceCode =
	| 'occlusal'
	| 'incisal'
	| 'mesial'
	| 'distal'
	| 'buccal'
	| 'lingual'
	| 'labial'
	| 'palatal';

export type OdontogramSurfaceDraft = {
	surface_code: OdontogramSurfaceCode;
	condition_code: OdontogramSurfaceCondition;
	notes: string;
};

export type OdontogramToothDraft = {
	tooth_number: string;
	tooth_condition: OdontogramToothCondition;
	notes: string;
	surface_findings: OdontogramSurfaceDraft[];
};

export type OdontogramEntryDraft = {
	chart_type: OdontogramChartType;
	notes: string;
	teeth: OdontogramToothDraft[];
};

export type OdontogramToothDefinition = {
	toothNumber: string;
	arch: 'upper' | 'lower';
	row: 'permanent_upper' | 'primary_upper' | 'primary_lower' | 'permanent_lower';
	label: string;
	position: number;
	toothKind: 'anterior' | 'posterior';
	surfaceCodes: OdontogramSurfaceCode[];
};

export const ODONTOGRAM_CHART_TYPE_OPTIONS: Array<{
	value: OdontogramChartType;
	label: string;
	summaryLabel: string;
	description: string;
}> = [
	{ value: 'permanent', label: 'Permanen', summaryLabel: 'Dewasa', description: 'FDI 11-48 untuk dentisi permanen.' },
	{ value: 'primary', label: 'Anak', summaryLabel: 'Anak', description: 'FDI 51-85 untuk dentisi sulung.' },
];

const PERMANENT_UPPER_TOOTH_NUMBERS = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'] as const;
const PRIMARY_UPPER_TOOTH_NUMBERS = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'] as const;
const PRIMARY_LOWER_TOOTH_NUMBERS = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'] as const;
const PERMANENT_LOWER_TOOTH_NUMBERS = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'] as const;

function isAnteriorTooth(toothNumber: string) {
	return ['1', '2', '3'].includes(toothNumber.slice(-1));
}

function getToothSurfaceCodes(toothNumber: string): OdontogramSurfaceCode[] {
	if (isAnteriorTooth(toothNumber)) {
		return ['incisal', 'mesial', 'distal', 'labial', 'palatal'];
	}

	return ['occlusal', 'mesial', 'distal', 'buccal', 'lingual'];
}

function buildOdontogramRowDefinitions(
	toothNumbers: readonly string[],
	arch: 'upper' | 'lower',
	row: 'permanent_upper' | 'primary_upper' | 'primary_lower' | 'permanent_lower'
): OdontogramToothDefinition[] {
	return toothNumbers.map((toothNumber, position) => ({
		toothNumber,
		arch,
		row,
		label: toothNumber,
		position,
		toothKind: isAnteriorTooth(toothNumber) ? 'anterior' as const : 'posterior' as const,
		surfaceCodes: getToothSurfaceCodes(toothNumber),
	}));
}

export const ODONTOGRAM_TOOTH_DEFINITIONS: OdontogramToothDefinition[] = [
	...buildOdontogramRowDefinitions(PERMANENT_UPPER_TOOTH_NUMBERS, 'upper', 'permanent_upper'),
	...buildOdontogramRowDefinitions(PRIMARY_UPPER_TOOTH_NUMBERS, 'upper', 'primary_upper'),
	...buildOdontogramRowDefinitions(PRIMARY_LOWER_TOOTH_NUMBERS, 'lower', 'primary_lower'),
	...buildOdontogramRowDefinitions(PERMANENT_LOWER_TOOTH_NUMBERS, 'lower', 'permanent_lower'),
];

export const ODONTOGRAM_WHOLE_TOOTH_OPTIONS: Array<{
	value: OdontogramToothCondition;
	label: string;
	description: string;
	badgeClassName: string;
}> = [
	{ value: 'sound', label: 'Normal', description: 'Tidak ada kelainan mayor pada gigi ini.', badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
	{ value: 'missing', label: 'Missing', description: 'Gigi tidak ada atau tidak teridentifikasi pada rongga mulut.', badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700' },
	{ value: 'extracted', label: 'Ekstraksi', description: 'Gigi sudah dicabut atau posisi pasca ekstraksi.', badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700' },
	{ value: 'retained_root', label: 'Sisa Akar', description: 'Mahkota hilang dan hanya tersisa akar.', badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700' },
	{ value: 'impacted', label: 'Impaksi', description: 'Gigi impaksi atau erupsi tidak sempurna.', badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700' },
	{ value: 'implant', label: 'Implan', description: 'Area gigi digantikan dengan implan.', badgeClassName: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
	{ value: 'crown', label: 'Crown', description: 'Gigi telah direstorasi penuh dengan crown.', badgeClassName: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
	{ value: 'mobility', label: 'Mobilitas', description: 'Gigi menunjukkan mobilitas bermakna.', badgeClassName: 'border-orange-200 bg-orange-50 text-orange-700' },
];

export const ODONTOGRAM_SURFACE_OPTIONS: Array<{
	value: OdontogramSurfaceCondition;
	label: string;
	shortLabel: string;
	fill: string;
	stroke: string;
}> = [
	{ value: 'sound', label: 'Normal', shortLabel: 'N', fill: '#ffffff', stroke: '#94a3b8' },
	{ value: 'caries', label: 'Karies', shortLabel: 'K', fill: '#ef4444', stroke: '#b91c1c' },
	{ value: 'restoration', label: 'Restorasi', shortLabel: 'R', fill: '#2563eb', stroke: '#1d4ed8' },
	{ value: 'sealant', label: 'Sealant', shortLabel: 'S', fill: '#16a34a', stroke: '#15803d' },
	{ value: 'fracture', label: 'Fraktur', shortLabel: 'F', fill: '#f97316', stroke: '#c2410c' },
	{ value: 'wear', label: 'Atrisi / Wear', shortLabel: 'W', fill: '#64748b', stroke: '#475569' },
	{ value: 'calculus', label: 'Calculus', shortLabel: 'C', fill: '#a855f7', stroke: '#7e22ce' },
];

export const ODONTOGRAM_SURFACE_LABELS: Record<OdontogramSurfaceCode, string> = {
	occlusal: 'Oklusal',
	incisal: 'Insisal',
	mesial: 'Mesial',
	distal: 'Distal',
	buccal: 'Bukal',
	lingual: 'Lingual',
	labial: 'Labial',
	palatal: 'Palatal',
};

const WHOLE_TOOTH_OPTION_LOOKUP = new Map(ODONTOGRAM_WHOLE_TOOTH_OPTIONS.map((item) => [item.value, item]));
const SURFACE_OPTION_LOOKUP = new Map(ODONTOGRAM_SURFACE_OPTIONS.map((item) => [item.value, item]));
const CHART_TYPE_OPTION_LOOKUP = new Map(ODONTOGRAM_CHART_TYPE_OPTIONS.map((item) => [item.value, item]));

export function normalizeOdontogramChartType(chartType?: string | null): OdontogramChartType {
	return chartType === 'primary' ? 'primary' : 'permanent';
}

export function getOdontogramChartTypeOption(chartType?: string | null) {
	return CHART_TYPE_OPTION_LOOKUP.get(normalizeOdontogramChartType(chartType)) || CHART_TYPE_OPTION_LOOKUP.get('permanent')!;
}

export function getOdontogramChartTitle(_chartType?: string | null) {
	return 'Odontogram SVG Standar';
}

export function getOdontogramToothDefinitions(_chartType?: string | null) {
	return ODONTOGRAM_TOOTH_DEFINITIONS;
}

export function getDefaultOdontogramToothNumber(_chartType?: string | null) {
	return '11';
}

export function getWholeToothOption(condition: string) {
	return WHOLE_TOOTH_OPTION_LOOKUP.get((condition || 'sound') as OdontogramToothCondition) || WHOLE_TOOTH_OPTION_LOOKUP.get('sound')!;
}

export function getSurfaceConditionOption(condition: string) {
	return SURFACE_OPTION_LOOKUP.get((condition || 'sound') as OdontogramSurfaceCondition) || SURFACE_OPTION_LOOKUP.get('sound')!;
}

export function getOdontogramToothDefinition(toothNumber: string, _chartType?: string | null) {
	return ODONTOGRAM_TOOTH_DEFINITIONS.find((tooth) => tooth.toothNumber === toothNumber);
}

export function buildOdontogramDraft(entry?: OdontogramEntry): OdontogramEntryDraft {
	const chartType = normalizeOdontogramChartType(entry?.chart_type);
	const toothDefinitions = ODONTOGRAM_TOOTH_DEFINITIONS;
	const savedTeeth = new Map((entry?.teeth || []).map((tooth) => [tooth.tooth_number, tooth]));

	return {
		chart_type: chartType,
		notes: entry?.notes || '',
		teeth: toothDefinitions.map((definition) => {
			const savedTooth = savedTeeth.get(definition.toothNumber);
			const savedSurfaceMap = new Map((savedTooth?.surface_findings || []).map((surface) => [surface.surface_code, surface]));

			return {
				tooth_number: definition.toothNumber,
				tooth_condition: (savedTooth?.tooth_condition as OdontogramToothCondition) || 'sound',
				notes: savedTooth?.notes || '',
				surface_findings: definition.surfaceCodes.map((surfaceCode) => {
					const savedSurface = savedSurfaceMap.get(surfaceCode);
					return {
						surface_code: surfaceCode,
						condition_code: (savedSurface?.condition_code as OdontogramSurfaceCondition) || 'sound',
						notes: savedSurface?.notes || '',
					};
				}),
			};
		}),
	};
}

export function serializeOdontogramDraft(draft: OdontogramEntryDraft) {
	return {
		chart_type: draft.chart_type,
		notes: draft.notes,
		teeth: draft.teeth
			.map((tooth) => ({
				tooth_number: tooth.tooth_number,
				tooth_condition: tooth.tooth_condition,
				notes: tooth.notes,
				surface_findings: tooth.surface_findings.filter((surface) => surface.condition_code !== 'sound' || surface.notes.trim() !== ''),
			}))
			.filter((tooth) => tooth.tooth_condition !== 'sound' || tooth.notes.trim() !== '' || tooth.surface_findings.length > 0),
	};
}

export function getOdontogramTimestamp(entry: OdontogramEntry) {
	return new Date(entry.updated_at || entry.created_at || 0).getTime();
}

export function sortOdontogramEntries(entries: OdontogramEntry[]) {
	return [...entries].sort((left, right) => getOdontogramTimestamp(right) - getOdontogramTimestamp(left));
}

export function countOdontogramEntryFindings(entry: Pick<OdontogramEntry, 'teeth'> | Pick<OdontogramEntryDraft, 'teeth'>) {
	return (entry.teeth || []).reduce((total, tooth) => {
		const toothCount = tooth.tooth_condition !== 'sound' ? 1 : 0;
		const surfaceCount = (tooth.surface_findings || []).filter((surface) => surface.condition_code !== 'sound').length;
		return total + toothCount + surfaceCount;
	}, 0);
}

export function countOdontogramMarkedTeeth(entry: Pick<OdontogramEntry, 'teeth'> | Pick<OdontogramEntryDraft, 'teeth'>) {
	return (entry.teeth || []).filter((tooth) => tooth.tooth_condition !== 'sound' || tooth.notes.trim() !== '' || (tooth.surface_findings || []).some((surface) => surface.condition_code !== 'sound')).length;
}

export function getOdontogramEntrySummary(entry?: OdontogramEntry | null) {
	if (!entry) {
		return 'Belum ada entri odontogram';
	}

	if ((entry.notes || '').trim()) {
		return entry.notes.trim();
	}

	const markedTeeth = countOdontogramMarkedTeeth(entry);
	const findingCount = countOdontogramEntryFindings(entry);
	if (findingCount === 0) {
		return 'Draft odontogram tanpa tanda klinis';
	}

	return `${findingCount} temuan pada ${markedTeeth} gigi`;
}

export function getOdontogramEntryStatus(entry?: OdontogramEntry | null, visitLocked = false): { label: string; tone: 'muted' | 'warning' | 'info' | 'success' } {
	if (!entry) {
		return { label: 'Belum ada', tone: 'muted' };
	}

	if (entry.status === 'cancelled') {
		return { label: 'Batal', tone: 'warning' };
	}

	if (visitLocked || entry.status === 'final') {
		return { label: 'Final', tone: 'success' };
	}

	const findingCount = countOdontogramEntryFindings(entry);
	if (findingCount === 0 && !(entry.notes || '').trim()) {
		return { label: 'Draft', tone: 'warning' };
	}

	return { label: 'Tersimpan', tone: 'info' };
}

export function canCancelOdontogramEntry(entry?: OdontogramEntry | null, visitLocked = false) {
	return Boolean(entry && !visitLocked && entry.status !== 'cancelled' && entry.status !== 'final');
}

export function isOdontogramEntryCancelled(entry?: OdontogramEntry | null) {
	return entry?.status === 'cancelled';
}

export function normalizeOdontogramEntryStatus(status?: string | null): OdontogramEntryStatus {
	if (status === 'cancelled' || status === 'final') {
		return status;
	}
	return 'draft';
}