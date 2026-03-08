export async function runAsyncAction<T>(
	action: () => Promise<T>,
	onError?: (error: unknown) => void
): Promise<T | null> {
	try {
		return await action();
	} catch (error) {
		onError?.(error);
		return null;
	}
}
