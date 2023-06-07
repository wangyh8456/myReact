import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';

//双缓冲技术：
//current:与视图中真实ui对应的fibernode树，每个节点称为current
//workInProgress:触发更新后，正在reconciler中计算的fibernode树，每个节点称为workInProgress

//react中以DFS的方式遍历ReactElement,如果有子节点遍历子节点,如果没有子节点,则遍历兄弟节点

export class FiberNode {
	type: any;
	tag: WorkTag;
	key: Key;
	stateNode: any;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;
	ref: Ref;

	pendingProps: Props;
	memoizedProps: Props | null;
	memoizedState: any;
	updateQueue: unknown;

	//如果是current,则指向workInProgress,如果是workInProgress,则指向current
	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		//实例属性
		this.tag = tag;
		//key默认值为null
		this.key = key || null;
		//<div></div>等HostComponent的真实dom节点
		this.stateNode = null;
		//比如对于FucntionComponent, tag=0,type为()=>{}函数本身
		this.type = null;

		//作为树状结构
		//指向父fibernode节点
		this.return = null;
		//指向右边的兄弟fibernode节点
		this.sibling = null;
		this.child = null;
		//如ul标签中有三个li标签,那么第一个li标签的index为0,第二个为1,第三个为2
		this.index = 0;

		this.ref = null;

		//作为工作单元
		//刚开始工作时的props
		this.pendingProps = pendingProps;
		//工作完成后的props
		this.memoizedProps = null;
		//工作完成后的状态
		this.memoizedState = null;
		//更新队列
		this.updateQueue = null;

		this.alternate = null;
		//副作用标签
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

//ReactDom.createRoot(rootElement).render(<App/>)
//当前应用统一根节点：FiberRootNode,hostRootFiber:传入的rootElement这个dom对应的Fiber节点，类型为HostRoot,App:<App/>
//FiberRootNode的current指向hostrootFiber，hostRootFiber的stateNode指向FiberRootNode
export class FiberRootNode {
	container: Container;
	current: FiberNode;
	//指向更新完成后的hostRootFiber
	finishedWork: FiberNode | null;
	pendingLanes: Lanes;
	finishedLane: Lane;
	pendingPassiveEffects: PendingPassiveEffects;
	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;

	if (wip === null) {
		//mount时
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		//update时
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;
	//函数式组件的type为函数本身
	if (typeof type === 'string') {
		//<div></div> type:div   typeof:string
		//HostText不存在fibernode
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
