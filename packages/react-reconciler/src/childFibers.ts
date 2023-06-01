import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText, Fragment } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';
import { REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';

type ExistingChildren = Map<string | number, FiberNode>;

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
	function deleteRemainingChildren(
		parentFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			return;
		}
		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(parentFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}
	function reconcileSingleElement(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		while (currentFiber !== null) {
			//update时
			if (currentFiber.key === key) {
				//key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;
						//1->此处是为了将<></>中的元素取出来使用
						if (element.type === REACT_FRAGMENT_TYPE) {
							props = element.props.children;
						}
						//type也相同，可复用
						const existing = useFiber(currentFiber, props);
						existing.return = parentFiber;
						//当前节点可复用，剩余节点删除 A1B2C3->A1
						deleteRemainingChildren(
							parentFiber,
							currentFiber.sibling
						);
						return existing;
					}
					//key相同，type不同，删掉所有旧的
					deleteRemainingChildren(parentFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型：', element);
						break;
					}
				}
			} else {
				//删掉旧的
				deleteChild(parentFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}
		//根据element创建fibernode
		let fiber;
		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
		fiber.return = parentFiber;
		return fiber;
	}

	function reconcileSingleTextNode(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			//update时
			if (currentFiber.tag === HostText) {
				//类型没变，可复用
				const existing = useFiber(currentFiber, { content });
				existing.return = parentFiber;
				deleteRemainingChildren(parentFiber, currentFiber.sibling);
				return existing;
			}
			//比如本来是<div>,变成了hahaha
			deleteChild(parentFiber, currentFiber);
			currentFiber = currentFiber.sibling;
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

	function reconcileChildrenArray(
		parentFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		//最后一个可复用fiber在current中的索引位置
		let lastPlacedIndex = 0;
		//创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		//创建的第一个fiber
		let firstNewFiber: FiberNode | null = null;

		//1.将current保存在fiber中
		const existingChildren: ExistingChildren = new Map();
		let current = currentFirstChild;
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		for (let i = 0; i < newChild.length; i++) {
			//2.遍历newChild，寻找是否可复用
			const after = newChild[i];
			const newFiber = updateFromMap(
				parentFiber,
				existingChildren,
				i,
				after
			);
			//xxx->false、null、···
			if (newFiber === null) {
				continue;
			}
			//3.标记移动还是插入
			newFiber.index = i;
			newFiber.return = parentFiber;

			if (lastNewFiber === null) {
				firstNewFiber = newFiber;
				lastNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}

			if (!shouldTrackEffects) {
				continue;
			}

			const current = newFiber.alternate;
			if (current !== null) {
				const oldIndex = current.index;
				if (oldIndex < lastPlacedIndex) {
					//移动
					newFiber.flags |= Placement;
					continue;
				} else {
					//不移动
					lastPlacedIndex = oldIndex;
				}
			} else {
				//插入
				newFiber.flags |= Placement;
			}
		}
		//4.将Map中剩下的标记为删除
		existingChildren.forEach((fiber) => {
			deleteChild(parentFiber, fiber);
		});
		return firstNewFiber;
	}

	function updateFromMap(
		parentFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = element.key !== null ? element.key : index;
		const before = existingChildren.get(keyToUse);

		//HostText
		if (typeof element === 'string' || typeof element === 'number') {
			if (before) {
				if (before.tag === HostText) {
					//可复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			return new FiberNode(HostText, { content: element + '' }, null);
		}
		//ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (element.type === REACT_FRAGMENT_TYPE) {
						//此处是直接构建了Fragment的fibernode,之后在beginwork的Fragment的case中取出children
						return updateFragment(
							parentFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					if (before) {
						if (before.type === element.type) {
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					return createFiberFromElement(element);
			}
			//TODO 数组类型
			//如<ul><li></li>[<li/>,<li/>]</ul>
			if (Array.isArray(element) && __DEV__) {
				console.warn('还未实现数组类型child：', element);
			}
		}
		if (Array.isArray(element)) {
			return updateFragment(
				parentFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}
		return null;
	}

	return function reconcileChildFibers(
		parentFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild: any
	) {
		//判断Fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			newChild = newChild.props.children;
		}
		//单节点
		if (typeof newChild === 'object' && newChild !== null) {
			//多节点
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(
					parentFiber,
					currentFiber,
					newChild
				);
			}

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
		//文本节点
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(parentFiber, currentFiber, newChild)
			);
		}

		//兜底删除
		if (currentFiber !== null) {
			deleteRemainingChildren(parentFiber, currentFiber);
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

function updateFragment(
	parentFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExistingChildren
) {
	let fiber;
	if (!current || current.tag !== Fragment) {
		fiber = createFiberFromFragment(elements, key);
	} else {
		existingChildren.delete(key);
		fiber = useFiber(current, elements);
	}
	fiber.return = parentFiber;
	return fiber;
}

//update时
export const reconcileChildFibers = childReconciler(true);
//mount时
export const mountChildFibers = childReconciler(false);
