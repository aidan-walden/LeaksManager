import { updateSettings } from '$lib/server/db/helpers';
import { updateSettingsSchema } from '$lib/schema';
import { fail } from '@sveltejs/kit';

export const actions = {
	updateSettings: async ({ request }) => {
		const formData = await request.formData();

		// Parse checkbox values - checkboxes send 'on' when checked, undefined when unchecked
		const data = {
			clearTrackNumberOnUpload: formData.get('clearTrackNumberOnUpload') === 'on',
			importToAppleMusic: formData.get('importToAppleMusic') === 'on',
			automaticallyMakeSingles: formData.get('automaticallyMakeSingles') === 'on'
		};

		const validated = updateSettingsSchema.safeParse(data);

		if (!validated.success) {
			console.error('Settings validation failed:', validated.error);
			return fail(400, { error: 'Invalid settings data' });
		}

		try {
			await updateSettings(validated.data);
			return { success: true, message: 'Settings saved successfully' };
		} catch (error) {
			console.error('Error updating settings:', error);
			return fail(500, { error: 'Failed to update settings' });
		}
	}
};
