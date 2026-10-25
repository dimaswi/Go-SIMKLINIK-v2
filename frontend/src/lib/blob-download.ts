type BlobDownloadResponse = {
  data: Blob | BlobPart;
  headers?: unknown;
};

function getHeaderValue(headers: unknown, headerName: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (name: string) => unknown }).get(headerName);
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  if (typeof headers !== 'object') {
    return undefined;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== normalizedHeaderName) {
      continue;
    }

    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.join('; ');
    }
  }

  return undefined;
}

function parseFilename(contentDisposition?: string): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*(?:UTF-8''|utf-8''|)([^;]+)/i);
  const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  const rawFilename = (utf8Match?.[1] || plainMatch?.[1] || '').trim();

  if (!rawFilename) {
    return null;
  }

  const sanitizedFilename = rawFilename.replace(/^['"]|['"]$/g, '');
  try {
    return decodeURIComponent(sanitizedFilename);
  } catch {
    return sanitizedFilename;
  }
}

export function openBlobResponse(response: BlobDownloadResponse, _fallbackFileName?: string) {
  const contentType = getHeaderValue(response.headers, 'content-type') || 'application/pdf';
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  
  const opened = window.open(objectUrl, '_blank');
  if (!opened) {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.target = '_blank';
    link.rel = 'noopener,noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

export function downloadBlobResponse(response: BlobDownloadResponse, fallbackFileName: string) {
  const contentDisposition = getHeaderValue(response.headers, 'content-disposition');
  const contentType = getHeaderValue(response.headers, 'content-type') || 'application/pdf';
  const fileName = parseFilename(contentDisposition) || fallbackFileName;

  // Jika dokumen PDF / cetakan, buka blob di tab baru dan jangan download file
  const isPdf = contentType.toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    openBlobResponse(response, fallbackFileName);
    return;
  }

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}