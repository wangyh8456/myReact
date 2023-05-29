import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

function childReconciler(shouldTrackEffects: boolean) {
	function deleteChild(parentFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}
		const deletions = parentFiber.deletions;
		if (deletions === null) {
			parentFiber.deletions = [childToDelete];
			parentFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}
	function reconcileSingleElement(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		work: if (currentFiber !== null) {
			//update时
			if (currentFiber.key === key) {
				//key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						//type也相同，可复用
						const existing = useFiber(currentFiber, element.props);
						existing.return = parentFiber;
						return existing;
					}
					//type不同，删掉旧的
					deleteChild(parentFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型：', element);
						break work;
					}
				}
			} else {
				//删掉旧的
				deleteChild(parentFiber, currentFiber);
			}
		}
		//根据element创建fibernode
		const fiber = createFiberFromElement(element);
		fiber.return = parentFiber;
		return fiber;
	}

	function reconcileSingleTextNode(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		if (currentFiber !== null) {
			//update时
			if (currentFiber.tag === HostText) {
				//类型没变，可复用
				const existing = useFiber(currentFiber, { content });
				existing.return = parentFiber;
				return existing;
			}
			//比如本来是<div>,变成了hahaha
			deleteChild(parentFiber, currentFiber);
		}
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = parentFiber;
		return fiber;
	}

	function placeSingleChild(fiber: FiberNode) {
		//应该追踪副作用且fiber.alternate即current为空时（首屏渲染时）搭上Placement标记
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}
		return fiber;
	}

	return function reconcileChildFibers(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		//单节点
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(
							parentFiber,
							currentFiber,
							newChild
						)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的reconcile类型', newChild);
					}
					break;
			}
		}
		//TODO多节点
		//文本节点
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(parentFiber, currentFiber, newChild)
			);
		}

		//兜底删除
		if (currentFiber !== null) {
			deleteChild(parentFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	//取的是双缓存树中一个节点对应的另一个节点，并更新如pendingProps等的值，clone一定是current或wip反复使用，不会创造新的fibernode
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

//update时
export const reconcileChildFibers = childReconciler(true);
//mount时
export const mountChildFibers = childReconciler(false);
