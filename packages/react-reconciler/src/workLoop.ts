import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { FiberNode, FiberRootNode, createWorkInProgress } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';
import { commitMutationEffects } from './commitWork';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { scheduleMicroTask } from 'hostConfig';

//当前正在进行的工作单元节点
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;

function initWorkLoop(root: FiberRootNode, lane: Lane) {
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	//TODO 调度功能

	//找到FiberRootNode,为了同时满足render时和setState时
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

function ensureRootIsScheduled(root: FiberRootNode) {
	const updatelane = getHighestPriorityLane(root.pendingLanes);
	if (updatelane === NoLane) {
		return;
	}

	if (updatelane === SyncLane) {
		//同步优先级，微任务调用
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updatelane);
		}
		//callback放入syncQueue中
		scheduleSyncCallback(
			//这里调用bind是为了让syncQueue中的这个callback在执行时就已经包含了root和updatelane	这两个参数
			//比如连续执行了三次setSatate，那么有三个performSyncWorkOnRoot被加入syncQueue,flushSyncCallbacks也会执行三次，
			//但第一次执行flushSyncCallbacks时isFlushingSyncQueue被修改为true，因此这三个flushSyncCallbacks只会执行第一次，
			//因为flushSyncCallbacks是微任务中调用，因此第一次isFlushingSyncQueue时，queue中就已经添加了三次performSyncWorkOnRoot，即批处理
			//由于syncQueue中有三个performSyncWorkOnRoot，需要在performSyncWorkOnRoot中对nextLane进行重新判断处理
			performSyncWorkOnRoot.bind(null, root, updatelane)
		);
		//以微任务方式执行flushSyncCallbacks
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		//其他优先级，宏任务调用
	}
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

function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		//其他比SyncLane更高的优先级
		//NoLane
		ensureRootIsScheduled(root);
		return;
	}

	if (__DEV__) {
		console.warn('render阶段开始');
	}

	//初始化
	initWorkLoop(root, lane);

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
	root.finishedLane = lane;
	wipRootRenderLane = NoLane;

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
	const lane = root.finishedLane;

	if (__DEV__ && lane === NoLane) {
		console.error('commit阶段finishedLane不应该为NoLane！');
	}

	//重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	markRootFinished(root, lane);

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
	const next = beginWork(fiber, wipRootRenderLane);
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
