const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	//test命令执行时的目录，工作目录
	rootDir: process.cwd(),
	//忽略根目录下的.history目录
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	//寻找测试中用到的外部依赖先从dist/node_modules中找(react、react-dom等),其次是defaults.moduleDirectories中的目录
	moduleDirectories: ['dist/node_modules', ...defaults.moduleDirectories],
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		//jest测试情况下scheduler包指向scheduler/unstable_mock.js
		'^scheduler$': '<rootDir>/node_modules/scheduler/unstable_mock.js'
	},
	fakeTimers: {
		enableGlobally: true,
		legacyFakeTimers: true
	},
	//制定matchers文件的目录，toHaveYielded等
	setupFilesAfterEnv: ['./scripts/jest/setupJest.js']
};
