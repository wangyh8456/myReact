import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { UpdateQueue, processUpdateQueue } from './updateQueue';
import {
	HostComponent,
	HostRoot,
	HostText,
	FunctionComponent
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';

//递归中的递阶段
export const beginWork = (wip: FiberNode) => {
	//比较，返回子fibernode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的部分。');
			}
			break;
	}
	return null;
};

function updateHostRoot(wip: FiberNode) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending);
	//<App/>为此处的pending的Update包含的参数，ReactElementType类型，不是function，因此memoizedState就是<App/>
	wip.memoizedState = memoizedState;

	const nextChildren = wip.memoizedState;
	reconcilerChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcilerChildren(wip, nextChildren);
	return wip.child;
}

function updateFunctionComponent(wip: FiberNode) {
	const nextChildren = renderWithHooks(wip);
	reconcilerChildren(wip, nextChildren);
	return wip.child;
}

function reconcilerChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;

	if (current !== null) {
		//update时
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		//mount时
		wip.child = mountChildFibers(wip, null, children);
	}
}
