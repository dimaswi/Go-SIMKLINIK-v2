import { useCallback, useEffect, useState } from 'react';
import { odontogramApi, type OdontogramEntry } from '@/lib/api';
import { sortOdontogramEntries } from './odontogram';

export function useVisitOdontogramEntries(visitId: number, enabled = true) {
	const [entries, setEntries] = useState<OdontogramEntry[]>([]);
	const [loading, setLoading] = useState(enabled);
	const [error, setError] = useState<string | null>(null);

	const replaceEntries = useCallback((updater: (currentEntries: OdontogramEntry[]) => OdontogramEntry[]) => {
		setEntries((currentEntries) => sortOdontogramEntries(updater(currentEntries)));
	}, []);

	const upsertEntry = useCallback((nextEntry: OdontogramEntry) => {
		replaceEntries((currentEntries) => [nextEntry, ...currentEntries.filter((entry) => entry.id !== nextEntry.id)]);
	}, [replaceEntries]);

	const reload = useCallback(async () => {
		if (!enabled || !visitId) {
			setEntries([]);
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const response = await odontogramApi.getByVisit(visitId);
			setEntries(sortOdontogramEntries(response.data.data || []));
		} catch (err: any) {
			setEntries([]);
			setError(err?.response?.data?.error || 'Gagal memuat entri odontogram');
		} finally {
			setLoading(false);
		}
	}, [enabled, visitId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	return {
		entries,
		loading,
		error,
		reload,
		replaceEntries,
		upsertEntry,
	};
}