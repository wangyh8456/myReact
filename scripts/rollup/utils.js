import path from 'path';
import fs from 'fs';
import ts from 'rollup-plugin-typescript2';
import cjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';

const pkgpath = path.resolve(__dirname, '../../packages');
const distpath = path.resolve(__dirname, '../../dist/node_modules');

export function resolvePkgPath(pkgname, isDist) {
	if (isDist) {
		return `${distpath}/${pkgname}`;
	}
	return `${pkgpath}/${pkgname}`;
}

export function getPackageJson(pkgname) {
	const path = `${resolvePkgPath(pkgname)}/package.json`;
	const str = fs.readFileSync(path, { encoding: 'utf-8' });
	//序列化为对象
	return JSON.parse(str);
}

export function getBaseRollupPlugins({
	alias = { __DEV__: true, preventAssignment: true },
	typescript = {}
} = {}) {
	return [replace(alias), cjs(), ts(typescript)];
}
