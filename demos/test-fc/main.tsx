import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
	return <Child />;
}

function Child() {
	return (
		<div>
			<span>my-react</span>
		</div>
	);
}

console.log(1234);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
