import { useState } from 'react';
import ReactDOM from 'react-dom/client';

console.log(import.meta.hot);

function App() {
	return <Child />;
}

function Child() {
	const [num, setNum] = useState(10000);
	window.setNum = setNum;
	return (
		<div>
			<span>{num}</span>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
