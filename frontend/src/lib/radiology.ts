import type { RadiologyOrderItem, RadiologyOrderParameterResult } from './api';

export function getRadiologyOrderParameterCount(item?: RadiologyOrderItem | null) {
  return item?.parameter_results?.length || 0;
}

export function isRadiologyParameterResultFilled(parameter?: RadiologyOrderParameterResult | null) {
  if (!parameter) return false;
  return Boolean((parameter.result_value || '').trim());
}

export function getRadiologyCompletedParameterCount(item?: RadiologyOrderItem | null) {
  return (item?.parameter_results || []).filter((parameter) => isRadiologyParameterResultFilled(parameter)).length;
}

export function isRadiologyOrderItemCompleted(item?: RadiologyOrderItem | null) {
  if (!item) return false;

  const parameterCount = getRadiologyOrderParameterCount(item);
  if (parameterCount > 0) {
    return (item.parameter_results || [])
      .filter((parameter) => parameter.is_required !== false)
      .every((parameter) => isRadiologyParameterResultFilled(parameter));
  }

  return Boolean((item.findings || '').trim() || (item.impression || '').trim());
}

export function getRadiologyOrderItemDetailPreview(item?: RadiologyOrderItem | null) {
  if (!item) return '-';

  const parameterCount = getRadiologyOrderParameterCount(item);
  const parts = [
    parameterCount > 0 ? `${parameterCount} parameter` : '',
    item.instructions ? `Instruksi: ${item.instructions}` : '',
    item.template_snapshot ? `Template: ${item.template_snapshot}` : '',
  ].filter(Boolean);

  return parts.join(' · ') || '-';
}

export function getRadiologyOrderItemResultPreview(item?: RadiologyOrderItem | null, maxPreview = 3) {
  if (!item) return '-';

  const parameterCount = getRadiologyOrderParameterCount(item);
  if (parameterCount > 0) {
    const completedCount = getRadiologyCompletedParameterCount(item);
    const parameterPreview = (item.parameter_results || [])
      .filter((parameter) => isRadiologyParameterResultFilled(parameter))
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
    item.impression,
    item.findings,
    item.recommendation ? `Saran: ${item.recommendation}` : '',
  ].filter(Boolean).join(' · ') || '-';
}
