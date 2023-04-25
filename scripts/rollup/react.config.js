import { getPackageJson, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';

const { name, module } = getPackageJson('react');
//react包的路径
const pkgpath = resolvePkgPath(name);
//react包的产物的路径
const distpath = resolvePkgPath(name, true);

export default [
	//react，即react项目中import React from 'react'时的包
	{
		input: `${pkgpath}/${module}`,
		output: {
			file: `${distpath}/index.js`,
			name: 'index.js',
			//umd兼容commonjs和esmodule
			format: 'umd'
		},
		plugins: [
			...getBaseRollupPlugins(),
			generatePackageJson({
				inputFolder: pkgpath,
				outputFolder: distpath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					main: 'index.js'
				})
			})
		]
	},
	//jsx-runtime
	{
		input: `${pkgpath}/src/jsx.ts`,
		output: [
			{
				file: `${distpath}/jsx-runtime.js`,
				name: 'jsx-runtime.js',
				format: 'umd'
			},
			{
				file: `${distpath}/jsx-dev-runtime.js`,
				name: 'jsx-dev-runtime.js',
				format: 'umd'
			}
		],
		plugins: getBaseRollupPlugins()
	}
];
