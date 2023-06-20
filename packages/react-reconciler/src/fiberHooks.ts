import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import { Update, createUpdateQueue } from './updateQueue';
import { UpdateQueue } from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { createUpdate } from './updateQueue';
import { enqueueUpdate } from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { processUpdateQueue } from './updateQueue';
import { Lane, NoLane, requestUpdateLanes } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { Passive, hookHasEffect } from './hookEffectTags';

//当前正在渲染的fibernode
let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

//要能适用于useState useEffect等各种Hook，需要一个Hook接口
interface Hook {
	memoizedState: any;
	baseState: any;
	updateQueue: unknown;
	baseQueue: Update<any> | null;
	next: Hook | null;
}

type EffectCallback = () => void;
type EffectDependencies = any[] | null;

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDependencies;
	//Effect存储在hook.memoizedState中,next指向下一个Effect(useEffect、useLayoutEffect、useInsertionEffect等)hook的memoizedState而不是下一个Hook
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	//赋值操作
	currentlyRenderingFiber = wip;
	//重置
	wip.memoizedState = null;
	//重置effect链表
	wip.updateQueue = null;
	renderLane = lane;

	const current = wip.alternate;
	if (current !== null) {
		//update时
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		//mount时,将当前使用的hooks的集合切换到mount时应该使用的hooks集合,此时内部数据共享层的current也发生了改变
		//即React包使用的useState等方法都是mount集合的方法
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	const Component = wip.type;
	const pendingProps = wip.pendingProps;
	const children = Component(pendingProps);

	//重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;

	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition
};

//void表示null或者undefined
function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDependencies
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		//插入Effect到环状链表中
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const first = lastEffect.next;
			effect.next = first;
			lastEffect.next = effect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

function mountEffect(
	create: EffectCallback | void,
	deps: EffectDependencies | void
) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	//mountEffect在mount阶段触发，mount时需要处理副作用，执行useEffect的回调函数
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	hook.memoizedState = pushEffect(
		Passive | hookHasEffect,
		create,
		//mount阶段没有销毁函数
		undefined,
		nextDeps
	);
}

function updateEffect(
	create: EffectCallback | void,
	deps: EffectDependencies | void
) {
	//按照顺序从hook链表中取出effect的hook
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		//当前effect hook在上次更新时对应的Effect状态
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			//浅比较依赖是否发生变化
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				//依赖没有发生变化，不需要更新
				hook.memoizedState = pushEffect(
					Passive,
					create,
					destroy,
					nextDeps
				);
				return;
			}
		}
		//依赖发生变化,给fiber添加有副作用操作标记，给Effect的tag添加hookHasEffect标记，表示这个副作用需要执行回调
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | hookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(
	nextDeps: EffectDependencies,
	prevDeps: EffectDependencies
) {
	if (prevDeps === null || nextDeps === null) {
		//useEffect(() => {})，没有传入依赖，每次都执行
		return false;
	}

	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

//这里没传入参数，但其实React包调用useState时传入了参数，只是这里没有用到而从hook中取了
function updateState<State>(): [State, Dispatch<State>] {
	const hook = updateWorkInProgressHook();
	//计算新的state
	const queue = hook.updateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;
	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	//只要不进入commit阶段，current与wip不会互换，因此可以把basequeue保存在current中,之后从current中恢复
	let baseQueue = current.baseQueue;

	if (pending !== null) {
		if (baseQueue !== null) {
			//合并baseQueue和pendingUpdateQueue
			const baseFirst = baseQueue.next;
			const pendingFirst = pending.next;

			baseQueue.next = pendingFirst;
			pending.next = baseFirst;
		}
		baseQueue = pending;
		current.baseQueue = pending;
		//已经保存在current中了
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const {
			memoizedState,
			baseState: newBaseState,
			baseQueue: newBaseQueue
		} = processUpdateQueue(baseState, baseQueue, renderLane);
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	const hook = mountWorkInProgressHook();
	let memoizedState;

	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	hook.baseState = memoizedState;

	//可以通过window.dispatch的方法调用setState,虽然没人这么用
	//通过bind预置了fiber和updateQueue两个参数，暴露出的dispatch方法只需要传入action即可
	//即用户使用setState时传入的值，setState(1)或者setState(x=>4x)等
	//@ts-ignore
	const dispatch = dispatchSetState.bind(
		null,
		currentlyRenderingFiber,
		queue
	);
	queue.dispatch = dispatch;

	return [memoizedState, dispatch];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	currentBatchConfig.transition = prevTransition;
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setIsPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setIsPending);
	hook.memoizedState = start;

	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;

	return [isPending as boolean, start];
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLanes();
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
}

//比如在使用const [count, setCount] = useState(0)时，
//useState(0)在mount过程中时会执行mountState(0)，mountState(0)会执行mountWorkInProgressHook()，
//如果workInProgressHook为null，说明是第一个hook，此时会将wip.memoizedState指向workInProgressHook
//否则将创建的hook加在hook链表的最后
function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		baseState: null,
		baseQueue: null,
		next: null
	};

	if (workInProgressHook === null) {
		//mount时，且为第一个hook
		if (currentlyRenderingFiber === null) {
			//在函数组件中执行useState时，currentlyRenderingFiber的值一定是函数组件对应的fibernode
			//此处fibernode为null，说明不是在函数组件中执行useState
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		//mount时，且不是第一个hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return workInProgressHook;
}

function updateWorkInProgressHook(): Hook {
	//TODO render阶段触发的更新
	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		//这是这个FC update时的第一个hook
		const current = currentlyRenderingFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			//mount 但这应该是update调用，因此是错误的边界情况
			nextCurrentHook = null;
		}
	} else {
		//FC update时的第二个及以后的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		//u1 u2 u3 -> u1 u2 u3 u4,currentHook一直都是上一次mount或update时的u1 u2 u3
		//当u4时，走else分支，nextCurrentHook=currentHook.next=null
		//多出一个u4的情况可能出现在if(xxx){useState(0)}这种情况中
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行的hook数量超过了上次执行的数量`
		);
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState,
		next: null
	};

	if (workInProgressHook === null) {
		//update时，且为第一个hook
		if (currentlyRenderingFiber === null) {
			//在函数组件中执行useState时，currentlyRenderingFiber的值一定是函数组件对应的fibernode
			//此处fibernode为null，说明不是在函数组件中执行useState
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		//mount时，且不是第一个hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}
