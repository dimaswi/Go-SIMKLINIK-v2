type ToastInvoker = (options: {
  variant?: 'default' | 'destructive';
  title: string;
  description?: string;
}) => void;

type OpenPdfDocumentOptions = {
  toast: ToastInvoker;
  loadingLabel: string;
  preparingMessage: string;
  blockedDescription: string;
  errorTitle: string;
  errorFallback: string;
  request: () => Promise<any>;
  onSuccess?: () => void;
};

export async function openPdfDocumentInNewWindow({
  toast,
  loadingLabel,
  preparingMessage,
  blockedDescription,
  errorTitle,
  errorFallback,
  request,
  onSuccess,
}: OpenPdfDocumentOptions) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast({
      variant: 'destructive',
      title: 'Jendela cetak diblokir',
      description: blockedDescription,
    });
    return;
  }

  printWindow.document.write(`<html><head><title>Menyiapkan ${loadingLabel}...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">${preparingMessage}</body></html>`);
  printWindow.document.close();

  try {
    const response = await request();
    const contentType = response.headers['content-type'] || 'application/pdf';
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);

    printWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    onSuccess?.();
  } catch (requestError: any) {
    printWindow.close();
    toast({
      variant: 'destructive',
      title: errorTitle,
      description: requestError.response?.data?.error || errorFallback,
    });
  }
}