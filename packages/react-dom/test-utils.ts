import { ReactElementType } from 'shared/ReactTypes';
//虽然可以直接使用src中的createRoot,但还是使用react-dom包中的
//因为testUtils包要使用react-dom中的方法应该属于调用外部依赖，用src中的方法会让react-dom包的方法被打包进去
//@ts-ignore
import { createRoot } from 'react-dom';

export function renderIntoDocument(element: ReactElementType) {
	const div = document.createElement('div');
	return createRoot(div).render(element);
}
