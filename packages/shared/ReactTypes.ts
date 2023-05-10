export type Type = any;
export type Key = any;
export type Ref = any;
export type Props = any;
export type ElmentType = any;

export interface ReactElementType {
	$$typeof: symbol | number;
	type: ElmentType;
	key: Key;
	ref: Ref;
	props: Props;
	__mark: string;
}

export type Action<State> = State | ((prevState: State) => State);
