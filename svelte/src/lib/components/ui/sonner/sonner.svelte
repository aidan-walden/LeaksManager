<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import { mode } from "mode-watcher";

	let {
		position = "bottom-right",
		expand = true,
		visibleToasts = 6,
		...restProps
	}: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current}
	{position}
	{expand}
	{visibleToasts}
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	{...restProps}
/>
