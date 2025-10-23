<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import CreateCard from './create-card.svelte';

	let {
		open = $bindable(),
		onOpenChange,
		callback
	}: { open: boolean; onOpenChange?: (open: boolean) => void; callback?: () => void } = $props();

	let file = $state<File | null>(null);
	let blob: Blob | null = $derived.by(() => {
		return file ? new Blob([file], { type: file.type }) : null;
	});

	const handleUpload = async (files: File[]) => {
		if (files.length === 0) return;
		file = files[0];
	};
</script>

{#snippet artistFields(loading: boolean)}
	<div class="flex flex-col gap-6">
		<div class="grid gap-2">
			<Label for="name">Name</Label>
			<Input
				id="name"
				name="name"
				type="text"
				placeholder="Artist Name"
				required
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="career-start">Career Start</Label>
			<Input
				id="career-start"
				name="career-start"
				type="number"
				placeholder="2016"
				disabled={loading}
			/>
		</div>
		<div class="grid gap-2">
			<Label for="career-end">Career End</Label>
			<Input
				id="career-end"
				name="career-end"
				type="number"
				placeholder="2020"
				disabled={loading}
			/>
		</div>
	</div>
{/snippet}

<CreateCard
	bind:open
	{onOpenChange}
	{callback}
	title="Create Artist"
	formId="create-artist-form"
	formAction="?/createArtist"
	uploadTabLabel="Artist Art"
	uploadPlaceholder="Upload Artist Art"
	formFields={artistFields}
	onFileUpload={handleUpload}
	uploadFieldImage={blob}
/>
