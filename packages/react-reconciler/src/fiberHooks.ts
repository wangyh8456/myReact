import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import { createUpdateQueue } from './updateQueue';
import { UpdateQueue } from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { createUpdate } from './updateQueue';
import { enqueueUpdate } from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { processUpdateQueue } from './updateQueue';
import { Lane, NoLane, requestUpdateLanes } from './fiberLanes';

//当前正在渲染的fibernode
let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

//要能适用于useState useEffect等各种Hook，需要一个Hook接口
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	//赋值操作
	currentlyRenderingFiber = wip;
	//重置
	wip.memoizedState = null;
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
	useState: mountState
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
};

function updateState<State>(): [State, Dispatch<State>] {
	const hook = updateWorkInProgressHook();
	//计算新的state
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	queue.shared.pending = null;
	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
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
		next: null
	};

	if (workInProgressHook === null) {
		//mount时，且为第一个hook
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
