import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
import { getContext, setContext } from 'svelte';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

type Getter<T> = () => T;

export type SidebarStateProps = {
	open: Getter<boolean>;
	setOpen: (open: boolean) => void;
};

type MobileState = Pick<IsMobile, 'current'>;

export class SidebarState {
	readonly props: SidebarStateProps;
	open = $derived.by(() => this.props.open());
	openMobile = $state(false);
	setOpen: SidebarStateProps["setOpen"];
	#isMobile: MobileState;
	state = $derived.by(() => (this.open ? "expanded" : "collapsed"));

	constructor(props: SidebarStateProps, isMobile: MobileState = new IsMobile()) {
		this.setOpen = props.setOpen;
		this.#isMobile = isMobile;
		this.props = props;
	}

	get isMobile() {
		return this.#isMobile.current;
	}

	handleShortcutKeydown = (e: KeyboardEvent) => {
		if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};

	setOpenMobile = (value: boolean) => {
		this.openMobile = value;
	};

	toggle = () => {
		return this.#isMobile.current
			? (this.openMobile = !this.openMobile)
			: this.setOpen(!this.open);
	};
}

const SYMBOL_KEY = "scn-sidebar";
const MISSING_SIDEBAR_CONTEXT =
	"Sidebar context is not available. Wrap the component in <Sidebar.Provider>.";

export function setSidebar(props: SidebarStateProps): SidebarState {
	return setContext(Symbol.for(SYMBOL_KEY), new SidebarState(props));
}

export function useSidebar(): SidebarState {
	const sidebar = getContext<SidebarState | undefined>(Symbol.for(SYMBOL_KEY));
	if (!sidebar) {
		throw new Error(MISSING_SIDEBAR_CONTEXT);
	}
	return sidebar;
}
