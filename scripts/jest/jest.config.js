const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	//test命令执行时的目录，工作目录
	rootDir: process.cwd(),
	//忽略根目录下的.history目录
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	//寻找测试中用到的外部依赖先从dist/node_modules中找(react、react-dom等),其次是defaults.moduleDirectories中的目录
	moduleDirectories: ['dist/node_modules', ...defaults.moduleDirectories],
	testEnvironment: 'jsdom'
};
