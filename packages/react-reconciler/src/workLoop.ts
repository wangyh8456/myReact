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
	commitHookEffectListCreate,
	commitLayoutEffects
} from './commitWork';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { scheduleMicroTask } from 'hostConfig';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_cancelCallback,
	unstable_shouldYield
} from 'scheduler';
import { Passive, hookHasEffect } from './hookEffectTags';

//当前正在进行的工作单元节点
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
//避免commitRoot重复调用
let rootDoesHasPassiveEffects = false;

type rootExitStatus = number;
const RootInComplete = 1; //中断
const RootCompleted = 2; //执行完
//TODO 执行过程中报错

function initWorkLoop(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
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
	const existingCallbackNode = root.callbackNode;

	if (updatelane === NoLane) {
		if (existingCallbackNode !== null) {
			unstable_cancelCallback(existingCallbackNode);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}
	//前后任务优先级一致，不需要重新调度，继续执行perform返回的函数来继续上一次任务
	const curPriority = updatelane;
	const prevPriority = root.callbackPriority;
	if (curPriority === prevPriority) {
		return;
	}
	//出现了更高优先级的任务，取消之前的任务，重新调度
	if (existingCallbackNode !== null) {
		unstable_cancelCallback(existingCallbackNode);
	}

	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${
				updatelane === SyncLane ? '微任务' : '宏任务'
			}中调度，优先级：`,
			updatelane
		);
	}

	if (updatelane === SyncLane) {
		//同步优先级，微任务调用
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
		const schedulerPriority = lanesToSchedulerPriority(updatelane);
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			//@ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
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

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	//保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(
		root.pendingPassiveEffects
	);
	if (didFlushPassiveEffect) {
		if (curCallback !== root.callbackNode) {
			//说明执行过useEffect回调后，useEffect中插入了优先级比当前更高的更新，触发了ensureRootIsScheduled改变了callbackNode
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	//render阶段
	const existStatus = renderRoot(root, lane, !needSync);

	ensureRootIsScheduled(root);

	if (existStatus === RootInComplete) {
		//中断
		if (root.callbackNode !== curCallbackNode) {
			//有一个更高优先级任务插入，在ensureRootIsScheduled中已经调用了
			return null;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	if (existStatus === RootCompleted) {
		//即已经计算完成的wip，就是当前current树的alternate
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;

		//wip fibernode树中的flags
		commitRoot(root);
	} else if (__DEV__) {
		console.warn('还未实现的并发更新结束状态');
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	//比如连续调用三次setState，其实syncQueue中第一个performSyncWorkOnRoot执行时，因为调用了fiberbook中三次dispatch,调用了三次scheduleupdateonfiber,queue中已经有了三个update
	//但是updateState只需要执行一次，因此其实第一个callback执行时就已经完成了更新，commit之后去掉syncLane标记，避免之后两次重复执行performSyncWorkOnRoot
	if (nextLane !== SyncLane) {
		//其他比SyncLane更高的优先级
		//NoLane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);

	if (existStatus === RootCompleted) {
		//即已经计算完成的wip，就是当前current树的alternate
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;

		//wip fibernode树中的flags
		commitRoot(root);
	} else if (__DEV__) {
		console.warn('还未实现的同步更新结束状态');
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.warn(`开始${shouldTimeSlice ? '并发' : '同步'}更新：`, root);
	}
	//要么本次lane和上一次一致，那么继续上次的更新，workInProgress从上次结束的地方恢复
	//要么本次lane和上一次不一致，那么调用initWorkLoop从根节点重新初始化workInProgress，从头再次计算渲染等
	if (wipRootRenderLane !== lane) {
		//初始化
		initWorkLoop(root, lane);
	}
	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop error:', e);
			}
			workInProgress = null;
		}
	} while (true);

	//中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}

	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.warn('错误：同步更新没有完成，但是workInProgress不为空');
	}
	//TODO 报错
	return RootCompleted;
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
		commitLayoutEffects(finishedWork, root);
	} else {
		root.current = finishedWork;
	}
	rootDoesHasPassiveEffects = false;
	//不断循环执行ensureRootIsScheduled，直到没有新的更新
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		//传入Passive，表示是useEffect的副作用
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		//必须同时具有Passive和hookHasEffect，副作用才会执行
		commitHookEffectListDestroy(Passive | hookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		//必须同时具有Passive和hookHasEffect，副作用才会执行
		commitHookEffectListCreate(Passive | hookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	//***因为useEffect过程中也有可能触发新的更新，比如useEffect中使用setState,因此执行完effect之后马上执行flushSyncCallbacks，保证更新执行
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
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
