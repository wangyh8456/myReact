import { getPackageJson, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module } = getPackageJson('react-dom');
//react-dom包的路径
const pkgpath = resolvePkgPath(name);
//react-dom包的产物的路径
const distpath = resolvePkgPath(name, true);

export default [
	//react-dom
	{
		input: `${pkgpath}/${module}`,
		output: [
			{
				file: `${distpath}/index.js`,
				name: 'index.js',
				//umd兼容commonjs和esmodule
				format: 'umd'
			},
			{
				//react18引入ReactDOM时引入的是ReactDOM包下的client.js
				file: `${distpath}/client.js`,
				name: 'client.js',
				//umd兼容commonjs和esmodule
				format: 'umd'
			}
		],
		plugins: [
			...getBaseRollupPlugins(),
			alias({
				entries: {
					//tsconfig.json中的paths配置只保证能通过ts检查
					//此处的配置能让rollup在打包时遇到import hostConfig时能正确找到文件
					hostConfig: `${pkgpath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
				inputFolder: pkgpath,
				outputFolder: distpath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
];
