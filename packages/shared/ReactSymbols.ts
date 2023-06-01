const supportsSymbol = typeof Symbol === 'function' && Symbol.for;

//宿主环境支持Symbol.for时，返回Symbol.for('react.element')，否则返回数字0xeac7
export const REACT_ELEMENT_TYPE = supportsSymbol
	? Symbol.for('react.element')
	: 0xeac7;

export const REACT_FRAGMENT_TYPE = supportsSymbol
	? Symbol.for('react.fragment')
	: 0xeacb;
