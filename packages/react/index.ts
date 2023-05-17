import { Dispatcher, resolveDispatcher } from './src/currentDispatcher';
import currentDispatcher from './src/currentDispatcher';
import { jsx, isValidElement as isValidElementFn } from './src/jsx';
//React

//useState的返回值是Dispatcher下的useState，即any，一般在接口中会有对于某个方法的定义
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export const version = '0.0.0';

//TODO:根据环境判断使用jsx还是jsxDEV
export const createElement = jsx;

export const isValidElement = isValidElementFn;
