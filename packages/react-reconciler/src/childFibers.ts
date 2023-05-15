import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode, createFiberFromElement } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { Placement } from './fiberFlags';

function childReconciler(shouldTrackEffects: boolean) {
	function reconcileSingleElement(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
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
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = parentFiber;
		return fiber;
	}

	function placeSingleChild(fiber: FiberNode) {
		console.warn('placeSingleChild:', fiber, shouldTrackEffects);
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
		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

//update时
export const reconcileChildFibers = childReconciler(true);
//mount时
export const mountChildFibers = childReconciler(false);
