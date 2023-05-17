import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import { createUpdateQueue } from './updateQueue';
import { UpdateQueue } from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { createUpdate } from './updateQueue';
import { enqueueUpdate } from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';

//当前正在渲染的fibernode
let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

//要能适用于useState useEffect等各种Hook，需要一个Hook接口
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

export function renderWithHooks(wip: FiberNode) {
	//赋值操作
	currentlyRenderingFiber = wip;
	//重置
	wip.memoizedState = null;

	const current = wip.alternate;
	if (current !== null) {
		//update时
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

	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

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
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
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
