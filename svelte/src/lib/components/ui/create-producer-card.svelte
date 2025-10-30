<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateCard from './create-card.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import MultiArtistCombobox from './multi-artist-combobox.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash';
import type { EditableProducer } from '@/schema';
type ArtistOption = { id: number; name: string };

	let {
	open = $bindable(),
	onOpenChange,
	callback,
	artists,
	producer = null
}: {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	callback?: () => void;
	artists: ArtistOption[];
	producer?: EditableProducer | null;
} = $props();

type Alias = {
	name: string;
	artistIds: number[];
};

let aliases = $state<Alias[]>([]);
let name = $state('');

function addAlias() {
	aliases = [...aliases, { name: '', artistIds: [] }];
}

	function removeAlias(index: number) {
		aliases = aliases.filter((_, i) => i !== index);
	}

	// Reset state whenever producer changes or the dialog closes
	$effect(() => {
		if (producer) {
			name = producer.name;
			aliases = (producer.producerAliases ?? []).map((alias) => ({
				name: alias.alias,
				artistIds:
					alias.producerAliasArtists?.map((link) => link.artistId).filter((id) => !Number.isNaN(id)) ?? []
			}));
			return;
		}

		if (!open) {
			name = '';
			aliases = [];
		}
	});
</script>

{#snippet producerFields(loading: boolean)}
	<div class="flex flex-col gap-6">
		<div class="grid gap-2">
			<Label for="name">Name</Label>
			<Input
				id="name"
				name="name"
				type="text"
				placeholder="Producer Name"
				required
				disabled={loading}
				bind:value={name}
			/>
		</div>
		{#if producer}
			<input type="hidden" name="id" value={producer.id} />
		{/if}
		<Separator />

		<!-- Aliases Section -->
		<div class="grid gap-4">
			<div class="flex items-center justify-between">
				<Label>Aliases</Label>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={addAlias}
					disabled={loading}
					class="h-8"
				>
					<PlusIcon class="mr-1 h-4 w-4" />
					Add Alias
				</Button>
			</div>

			{#if aliases.length > 0}
				<div class="flex flex-col gap-3">
					{#each aliases as alias, index (index)}
						<div class="grid gap-2 rounded-lg border p-3">
							<div class="flex items-center justify-between gap-2">
								<Label for="alias-{index}-name" class="text-sm">Alias Name</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => removeAlias(index)}
									disabled={loading}
									class="h-6 w-6 p-0"
								>
									<TrashIcon class="h-4 w-4" />
								</Button>
							</div>
							<Input
								id="alias-{index}-name"
								bind:value={alias.name}
								type="text"
								placeholder="e.g., Metro"
								disabled={loading}
								class="h-9"
							/>

							<div class="mt-2 grid gap-2">
								<Label for="alias-{index}-artists" class="text-sm text-muted-foreground">
									Artist Restrictions (optional)
								</Label>
								<MultiArtistCombobox
									{artists}
									bind:value={alias.artistIds}
									disabled={loading}
									useProducerMode={false}
								/>
								<p class="text-xs text-muted-foreground">
									Leave empty for global alias, or select specific artists
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">
					No aliases added. Aliases help match producers from filenames.
				</p>
			{/if}
		</div>

		<!-- Hidden inputs to serialize aliases data -->
		{#each aliases as alias, index}
			<input type="hidden" name="aliases[{index}].name" value={alias.name} />
			<input type="hidden" name="aliases[{index}].artistIds" value={alias.artistIds.join(',')} />
		{/each}
	</div>
{/snippet}

<CreateCard
	bind:open
	{onOpenChange}
	{callback}
	title={producer ? 'Edit Producer' : 'Create Producer'}
	formId={producer ? 'update-producer-form' : 'create-producer-form'}
	formAction={producer ? '?/updateProducer' : '?/createProducer'}
	submitLabel={producer ? 'Save Changes' : 'Create'}
	formFields={producerFields}
/>
