import type { Component, ComponentProps, Snippet } from 'svelte';

export class RenderComponentConfig<
	TProps extends Record<string, unknown>,
	TComponent extends Component<TProps>
> {
	component: TComponent;
	props: TProps;
	constructor(component: TComponent, props: TProps) {
		this.component = component;
		this.props = props;
	}
}

export class RenderSnippetConfig<TProps> {
	snippet: Snippet<[TProps]>;
	params: TProps;
	constructor(snippet: Snippet<[TProps]>, params: TProps) {
		this.snippet = snippet;
		this.params = params;
	}
}

export function renderComponent<
	TProps extends Record<string, unknown>,
	TComponent extends Component<TProps>
>(component: TComponent, props: TProps): RenderComponentConfig<TProps, TComponent> {
	return new RenderComponentConfig(component, props);
}

export function renderSnippet<TProps>(
	snippet: Snippet<[TProps]>,
	params: TProps
): RenderSnippetConfig<TProps>;
export function renderSnippet<TProps>(snippet: Snippet<[TProps]>, params: TProps) {
	return new RenderSnippetConfig(snippet, params);
}
