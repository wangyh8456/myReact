import currentBatchConfig from 'react/src/currentBatchConfig';
import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler';
import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b00001;
//连续输入，如拖拽事件
export const InputContinuousLane = 0b00010;
export const DefaultLane = 0b00100;
export const TransitionLane = 0b01000;
export const IdleLane = 0b10000;

export const NoLane = 0b00000;
export const NoLanes = 0b00000;

export function mergeLanes(leftLanes: Lanes, rightLane: Lane): Lanes {
	return leftLanes | rightLane;
}

//updateContainer时，由于没有设置，unstable_getCurrentPriorityLevel获取到的是NormalPriority，所以lane是DefaultLane
//triggerEventFlow用eventCallback.call调用dispatchSetState时，由于synthenticEvent文件中unstable_runWithPriority设置了click事件优先级为ImmediatePriority，所以lane是SyncLane
export function requestUpdateLanes() {
	const isTransition = currentBatchConfig.transition !== null;
	if (isTransition) {
		// 如果用unstable_runWithPriority，需要设置为scheduler的优先级，然后把优先级转化为lane，这里直接在满足条件时设置为TransitionLane
		return TransitionLane;
	}

	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	const lane = schedulerPriorityToLane(currentSchedulerPriority);
	// console.log('当前优先级：', currentSchedulerPriority, '对应的lane：', lane);
	return lane;
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);
	//为了灵活性，可能条件不是全等而是大于
	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority;
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}
	return unstable_IdlePriority;
}

export function schedulerPriorityToLane(schedulerPriority: number): Lane {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset;
}
