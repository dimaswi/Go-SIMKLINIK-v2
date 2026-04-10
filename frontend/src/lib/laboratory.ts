import type { LaboratoryOrderItem, LaboratoryOrderParameterResult } from './api';

const laboratoryReferenceNumberPattern = /[-+]?\d[\d.,]*/g;

export type LaboratoryReferenceFlag = '' | 'normal' | 'rendah' | 'tinggi' | 'abnormal';

function normalizeReferenceText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseFlexibleReferenceNumber(value: string) {
  let token = value.trim().replace(/^[<>~=≤≥]+/, '').replace(/%/g, '').trim();
  if (!token || !/^[+-]?[\d.,]+$/.test(token)) return Number.NaN;

  if (token.includes(',') && token.includes('.')) {
    token = token.lastIndexOf(',') > token.lastIndexOf('.')
      ? token.replace(/\./g, '').replace(/,/g, '.')
      : token.replace(/,/g, '');
  } else if ((token.match(/,/g) || []).length > 1) {
    token = token.replace(/,/g, '');
  } else if ((token.match(/,/g) || []).length === 1) {
    const commaIndex = token.lastIndexOf(',');
    const digitsAfter = token.length - commaIndex - 1;
    token = digitsAfter === 3 ? token.replace(/,/g, '') : token.replace(/,/g, '.');
  } else if ((token.match(/\./g) || []).length > 1) {
    const parts = token.split('.');
    const lastPart = parts[parts.length - 1];
    token = lastPart.length <= 2 ? `${parts.slice(0, -1).join('')}.${lastPart}` : parts.join('');
  } else if ((token.match(/\./g) || []).length === 1) {
    const dotIndex = token.lastIndexOf('.');
    const digitsAfter = token.length - dotIndex - 1;
    if (digitsAfter === 3) {
      token = token.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function extractReferenceNumbers(referenceValue: string) {
  return Array.from(referenceValue.matchAll(laboratoryReferenceNumberPattern))
    .map((match) => parseFlexibleReferenceNumber(match[0]))
    .filter((value) => Number.isFinite(value));
}

export function getLaboratoryAutoFlag(resultValue?: string, referenceValue?: string): LaboratoryReferenceFlag {
  const normalizedResult = (resultValue || '').trim();
  const normalizedReference = (referenceValue || '').trim();
  if (!normalizedResult || !normalizedReference) return '';

  const resultNumber = parseFlexibleReferenceNumber(normalizedResult);
  if (Number.isFinite(resultNumber)) {
    const referenceNumbers = extractReferenceNumbers(normalizedReference);
    const referenceText = normalizeReferenceText(normalizedReference);

    if (referenceNumbers.length >= 2 && /-|–|sampai/.test(referenceText)) {
      const [lowerBound, upperBound] = referenceNumbers;
      if (resultNumber < lowerBound) return 'rendah';
      if (resultNumber > upperBound) return 'tinggi';
      return 'normal';
    }

    if (referenceNumbers.length >= 1) {
      const threshold = referenceNumbers[0];
      if (referenceText.startsWith('<=') || referenceText.startsWith('≤')) return resultNumber <= threshold ? 'normal' : 'tinggi';
      if (referenceText.startsWith('<')) return resultNumber < threshold ? 'normal' : 'tinggi';
      if (referenceText.startsWith('>=') || referenceText.startsWith('≥')) return resultNumber >= threshold ? 'normal' : 'rendah';
      if (referenceText.startsWith('>')) return resultNumber > threshold ? 'normal' : 'rendah';
      if (resultNumber < threshold) return 'rendah';
      if (resultNumber > threshold) return 'tinggi';
      return 'normal';
    }
  }

  return normalizeReferenceText(normalizedResult) === normalizeReferenceText(normalizedReference) ? 'normal' : 'abnormal';
}

export function getLaboratoryFlagBadgeClassName(flag?: string) {
  switch ((flag || '').toLowerCase()) {
    case 'normal':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'rendah':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'tinggi':
      return 'border-rose-300 bg-rose-50 text-rose-700';
    case 'abnormal':
      return 'border-orange-300 bg-orange-50 text-orange-700';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-600';
  }
}

export function getLaboratoryOrderParameterCount(item?: LaboratoryOrderItem | null) {
  return item?.parameter_results?.length || 0;
}

export function isLaboratoryParameterResultFilled(parameter?: LaboratoryOrderParameterResult | null) {
  if (!parameter) return false;
  return Boolean((parameter.result_value || '').trim());
}

export function getLaboratoryCompletedParameterCount(item?: LaboratoryOrderItem | null) {
  return (item?.parameter_results || []).filter((parameter) => isLaboratoryParameterResultFilled(parameter)).length;
}

export function isLaboratoryOrderItemCompleted(item?: LaboratoryOrderItem | null) {
  if (!item) return false;

  if (getLaboratoryOrderParameterCount(item) > 0) {
    return (item.parameter_results || [])
      .filter((parameter) => parameter.is_required !== false)
      .every((parameter) => isLaboratoryParameterResultFilled(parameter));
  }

  return Boolean((item.result_value || '').trim());
}

export function getLaboratoryOrderItemDetailPreview(item?: LaboratoryOrderItem | null) {
  if (!item) return '-';

  const parameterCount = getLaboratoryOrderParameterCount(item);
  const parts = [
    parameterCount > 0 ? `${parameterCount} parameter` : item.unit_snapshot ? `Unit ${item.unit_snapshot}` : '',
    parameterCount === 0 && item.normal_value_snapshot ? `Rujukan ${item.normal_value_snapshot}` : '',
    item.instructions ? `Instruksi: ${item.instructions}` : '',
  ].filter(Boolean);

  return parts.join(' · ') || '-';
}

export function getLaboratoryOrderItemResultPreview(item?: LaboratoryOrderItem | null, maxPreview = 3) {
  if (!item) return '-';

  const parameterCount = getLaboratoryOrderParameterCount(item);
  if (parameterCount > 0) {
    const completedCount = getLaboratoryCompletedParameterCount(item);
    const parameterPreview = (item.parameter_results || [])
      .filter((parameter) => isLaboratoryParameterResultFilled(parameter))
      .slice(0, maxPreview)
      .map((parameter) => {
        const parameterName = parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-';
        const parameterValue = (parameter.result_value || '').trim() || '-';
        return `${parameterName}: ${parameterValue}`;
      })
      .join(' · ');

    return [`${completedCount}/${parameterCount} parameter terisi`, parameterPreview].filter(Boolean).join(' · ');
  }

  return [
    item.result_value,
    item.flag ? `Flag ${item.flag}` : '',
  ].filter(Boolean).join(' · ') || '-';
}