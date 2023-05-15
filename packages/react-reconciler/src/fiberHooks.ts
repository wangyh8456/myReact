import { FiberNode } from './fiber';

export function renderWithHooks(wip: FiberNode) {
	const Component = wip.type;
	const pendingProps = wip.pendingProps;
	const children = Component(pendingProps);

	return children;
}
