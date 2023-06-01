//ts联合类型
export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment;

//函数式组件
export const FunctionComponent = 0;
//React.render(<App />, document.getElementById('root'))这里的根节点,这个dom对应的Fiber
export const HostRoot = 3;
//原生标签 如<div></div>
export const HostComponent = 5;
//<div>123</div>中的123
export const HostText = 6;
//<></>
export const Fragment = 7;
