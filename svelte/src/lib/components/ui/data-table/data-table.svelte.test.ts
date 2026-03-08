import { describe, expect, it } from 'vitest';
import {
	RenderComponentConfig,
	RenderSnippetConfig,
	renderComponent,
	renderSnippet
} from './render-helpers';

describe('data table helpers', () => {
	it('wraps renderable helpers in config objects', () => {
		const component = {} as never;
		const snippet = (() => undefined) as never;

		expect(renderComponent(component)).toBeInstanceOf(RenderComponentConfig);
		expect(renderSnippet(snippet, { id: 1 })).toBeInstanceOf(RenderSnippetConfig);
	});

	it('exports render helper constructors', () => {
		expect(RenderComponentConfig).toBeDefined();
		expect(RenderSnippetConfig).toBeDefined();
	});
});
