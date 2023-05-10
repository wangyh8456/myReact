import {
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { HostComponent, HostRoot, HostText } from './workTags';
import { NoFlags } from './fiberFlags';

//递归中的归阶段
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	const current = wip.alternate;

	switch (wip.tag) {
		case HostRoot:
			bubbleProperties(wip);
			return null;
		case HostComponent:
			if (current !== null && wip.stateNode) {
				//update
				//对于HostComponent，stateNode就是dom
				//TODO
			} else {
				//1.构建Dom
				const instance = createInstance(wip.type, newProps);
				//2.将Dom插入到Dom树中
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				//update
				//对于HostComponent，stateNode就是dom
				//TODO
			} else {
				//1.构建Dom
				const instance = createTextInstance(newProps.content);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		default:
			if (__DEV__) {
				console.warn('completeWork未实现的部分 : ', wip);
			}
			break;
	}
};

function appendAllChildren(parent: FiberNode, wip: FiberNode) {
	let node = wip.child;

	while (node !== null) {
		//为<div></div>等dom对应的fibernode或文本节点对应的fibernode时直接添加到dom中
		if (node.tag === HostComponent || node.tag === HostText) {
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			node.child.return = node;
			node = node.child;
			continue;
		}

		if (node === wip) {
			return;
		}

		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			node = node?.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child != null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;
		child.return = wip;
		child = child.sibling;
	}

	wip.subtreeFlags |= subtreeFlags;
}
