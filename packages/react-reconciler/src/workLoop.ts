import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import { HostRoot } from './workTags';
import {
	commitMutationEffects,
	commitHookEffectListUnmount,
	commitHookEffectListDestroy,
	commitHookEffectListCreate
} from './commitWork';
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
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority
} from 'scheduler';
import { Passive, hookHasEffect } from './hookEffectTags';

//当前正在进行的工作单元节点
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
//避免commitRoot重复调用
let rootDoesHasPassiveEffects = false;

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
			// 比如连续执行了三次setSatate，那么有三个performSyncWorkOnRoot被加入syncQueue,flushSyncCallbacks也会执行三次，
			// 但第一次执行flushSyncCallbacks时isFlushingSyncQueue被修改为true，不会出现三个flushSyncCallbacks一起执行的现象，
			// 同时第一次执行好之后，执行另外两个时虽然isFlushingSyncQueue为false，但syncQueue已经在第一次执行后重置为null，因此相当于这三个flushSyncCallbacks只会执行第一次，
			// 因为flushSyncCallbacks是微任务中调用，因此第一次flushSyncCallbacks时，queue中就已经添加了三次performSyncWorkOnRoot，即批处理
			// 由于syncQueue中有三个performSyncWorkOnRoot，需要在performSyncWorkOnRoot中对nextLane进行重新判断处理
			// 第一个performSyncWorkOnRoot执行完后root.pendingLanes的syncLane已经被去掉，因此后面两个performSyncWorkOnRoot不会执行
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

	//比如连续调用三次setState，其实syncQueue中第一个performSyncWorkOnRoot执行时，因为调用了fiberbook中三次dispatch,调用了三次scheduleupdateonfiber,queue中已经有了三个update
	//但是updateState只需要执行一次，因此其实第一个callback执行时就已经完成了更新，commit之后去掉syncLane标记，避免之后两次重复执行performSyncWorkOnRoot
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

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			//调度副作用
			//采用了scheduler提供的scheduleCallback方法，第一个参数为调度优先级，这里等于在setTimeout中调用
			scheduleCallback(NormalPriority, () => {
				//调度已经完成，异步执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	//判断是否存在三个子阶段需要的操作
	//root flags root subtreeflags
	const subtreeHasEffects =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;
	if (subtreeHasEffects || rootHasEffect) {
		//beforeMutation阶段
		//mutation阶段
		commitMutationEffects(finishedWork, root);

		//mutation阶段结束layout阶段开始之间的操作
		//finishedWork为本次更新的wip，将它赋值给current变成current树
		root.current = finishedWork;

		//layout阶段
	} else {
		root.current = finishedWork;
	}
	rootDoesHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	pendingPassiveEffects.unmount.forEach((effect) => {
		//传入Passive，表示是useEffect的副作用
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		//必须同时具有Passive和hookHasEffect，副作用才会执行
		commitHookEffectListDestroy(Passive | hookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		//必须同时具有Passive和hookHasEffect，副作用才会执行
		commitHookEffectListCreate(Passive | hookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	//因为useEffect过程中也有可能触发新的更新,执行完effect之后马上执行flushSyncCallbacks而不是异步执行
	flushSyncCallbacks();
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
