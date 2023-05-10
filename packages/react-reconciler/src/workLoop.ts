import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { FiberNode, FiberRootNode, createWorkInProgress } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';
import { commitMutationEffects } from './commitWork';

//当前正在进行的工作单元节点
let workInProgress: FiberNode | null = null;

function initWorkLoop(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {});
}

export function scheduleUpdateOnFiber(fiber: FiberNode) {
	//TODO 调度功能

	//找到FiberRootNode,为了同时满足render时和setState时
	const root = markUpdateFromFiberToRoot(fiber);
	renderRoot(root);
}

function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = fiber.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

function renderRoot(root: FiberRootNode) {
	//初始化
	initWorkLoop(root);

	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop error:', e);
			}
			workInProgress = null;
		}
	} while (true);

	//即已经计算完成的wip，就是当前current树的alternate
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;

	//wip fibernode树中的flags
	commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始:', finishedWork);
	}

	//重置
	root.finishedWork = null;

	//判断是否存在三个子阶段需要的操作
	//root flags root subtreeflags
	const subtreeHasEffects =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;
	if (subtreeHasEffects || rootHasEffect) {
		//beforeMutation阶段
		//mutation阶段
		commitMutationEffects(finishedWork);

		//mutation阶段结束layout阶段开始之间的操作
		//finishedWork为本次更新的wip，将它赋值给current变成current树
		root.current = finishedWork;

		//layout阶段
	} else {
		root.current = finishedWork;
	}
}

function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	//beginWork返回子fibernode
	const next = beginWork(fiber);
	fiber.memoizedProps = fiber.pendingProps;
	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
