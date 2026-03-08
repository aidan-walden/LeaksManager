type SubmitResult = {
	id?: number;
};

type HandleCreateCardSuccessOptions = {
	result: SubmitResult;
	resetForm: () => void;
	invalidate: () => Promise<void>;
	callback?: (recordId: number) => void | Promise<void>;
	close: () => void;
};

export async function handleCreateCardSuccess({
	result,
	resetForm,
	invalidate,
	callback,
	close
}: HandleCreateCardSuccessOptions) {
	resetForm();
	await invalidate();

	if (callback && result.id) {
		await callback(result.id);
	}

	close();
}
