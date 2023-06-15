import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_runWithPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

export const elementPropsKey = '__props';

const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('不支持的事件类型：', eventType);
		return;
	}
	if (__DEV__) {
		console.log('初始化事件：', eventType);
	}
	container.addEventListener(eventType, (e) => {
		//e中的target是触发事件的元素
		dispatchEvent(container, eventType, e);
	});
}

function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;
	if (targetElement === null) {
		console.warn('事件没有target', e);
		return;
	}
	//1.收集从element到container沿途的事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	//2.构造合成事件
	const se = createSyntheticEvent(e);
	//3.遍历capture
	triggerEventFlow(capture, se);
	if (!se.__stopPropagation) {
		//4.遍历bubble
		triggerEventFlow(bubble, se);
	}
}

function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const eventCallback = paths[i];
		//改变unstable_getCurrentPriorityLevel返回的当前currentPriority的值
		unstable_runWithPriority(eventTypeToSchedulePriority(se.type), () => {
			eventCallback.call(null, se);
		});

		if (se.__stopPropagation) {
			break;
		}
	}
}

function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	const originalStopPropagation = syntheticEvent.stopPropagation;

	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originalStopPropagation) {
			originalStopPropagation();
		}
	};
	return syntheticEvent;
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement && targetElement !== container) {
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			const callbackNameList =
				getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						//捕获阶段事件执行顺序：从外到内，冒泡阶段事件执行顺序：从内到外
						if (i === 0) {
							//capture
							paths.capture.unshift(eventCallback);
						} else {
							//bubble
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}
		//从target(当前元素)到container(根元素)沿途的事件
		targetElement = targetElement.parentNode as DOMElement;
	}
	return paths;
}

function eventTypeToSchedulePriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
