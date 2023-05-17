import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import {
	Type,
	Key,
	Ref,
	Props,
	ReactElementType,
	ElmentType
} from 'shared/ReactTypes';

//ReactElement

const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'Yaohui'
	};
	return element;
};

export const isValidElement = (object: any) => {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
};

export const jsx = (type: ElmentType, config: any, ...maybeChildren: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		//判断这个key为prop的属性是config自己的属性而不是原型链上的属性，仅将自己的属性复制给props
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	//处理children
	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength) {
		//child | [child,child,child ...]
		if (maybeChildrenLength === 1) {
			props.children = maybeChildren[0];
		} else {
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

//jsxDev和jsx的区别主要体现在maybeChildren的处理上,产生这种区别的原因是因为jsxDev是在开发环境下使用的，而jsx是在生产环境下使用的
//开发环境和生产环境下传给jsx或者jsxDev的参数是不同的
export const jsxDEV = (type: ElmentType, config: any) => {
	const props: Props = {};
	let key: Key = null;
	let ref: Ref = null;

	for (const prop in config) {
		const value = config[prop];
		if (prop === 'key') {
			if (value !== undefined) {
				key = '' + value;
			}
			continue;
		}
		if (prop === 'ref') {
			if (value !== undefined) {
				ref = value;
			}
			continue;
		}
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = value;
		}
	}

	return ReactElement(type, key, ref, props);
};
