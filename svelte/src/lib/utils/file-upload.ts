import type { FileUpload } from '$lib/ipc';

// Reads a File into the base64 shape the upload IPC methods accept.
export async function fileToUpload(file: File): Promise<FileUpload> {
	const base64Data = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('failed to read file as data URL'));
				return;
			}
			const data = reader.result.split(',', 2)[1];
			if (!data) {
				reject(new Error('failed to parse base64 data from file'));
				return;
			}
			resolve(data);
		};
		reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
		reader.readAsDataURL(file);
	});

	return { filename: file.name, base64Data };
}
