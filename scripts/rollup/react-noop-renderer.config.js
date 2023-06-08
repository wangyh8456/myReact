import { getPackageJson, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module, peerDependencies } = getPackageJson(
	'react-noop-renderer'
);
//react-noop-renderer包的路径
const pkgpath = resolvePkgPath(name);
//react-noop-renderer包的产物的路径
const distpath = resolvePkgPath(name, true);

export default [
	//react-noop-renderer
	{
		input: `${pkgpath}/${module}`,
		output: [
			{
				file: `${distpath}/index.js`,
				//如果是index.js,则esmodule引入没问题，window会变成window[index.js],所以这里要改成ReactDOM
				name: 'ReactNoopRenderer',
				//umd兼容commonjs和esmodule
				format: 'umd'
			}
		],
		//external表示不打包的依赖,此处就是react-noop-renderer的peerDependencies,即react
		external: [...Object.keys(peerDependencies), 'scheduler'],
		plugins: [
			...getBaseRollupPlugins({
				typescript: {
					tsconfigOverride: {
						exclude: ['./packages/react-dom/**/*'],
						compilerOptions: {
							paths: {
								hostConfig: [`./${name}/src/hostConfig.ts`]
							}
						}
					}
				}
			}),
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
