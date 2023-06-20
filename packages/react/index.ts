import { Dispatcher, resolveDispatcher } from './src/currentDispatcher';
import currentDispatcher from './src/currentDispatcher';
import currentBatchConfig from './src/currentBatchConfig';
import { jsx, isValidElement as isValidElementFn } from './src/jsx';
//React

//useState的函数签名是Dispatcher下的useState，即any，一般在接口中会有对于某个方法的定义
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	currentBatchConfig
};

export const version = '0.0.0';

//TODO:根据环境判断使用jsx还是jsxDEV
export const createElement = jsx;

export const isValidElement = isValidElementFn;
