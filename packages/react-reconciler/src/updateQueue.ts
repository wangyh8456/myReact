import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';

export interface Update<State> {
	action: Action<State>;
}

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpate: Update<State> | null
): { memoizedState: State } => {
	//ReturnType获取函数返回值类型
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpate !== null) {
		const action = pendingUpate.action;
		if (action instanceof Function) {
			//baseState 1 update x=>4x ===>memoizedState:4
			result.memoizedState = action(baseState);
		} else {
			//baseState 1 update 2 ===>memoizedState:2
			result.memoizedState = action;
		}
	}

	return result;
};