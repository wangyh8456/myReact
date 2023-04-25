module.exports = {
	extends: ['@commitlint/config-conventional']
};

/* 
	fix：修复 bug。
	feat：添加新功能。
	docs：只修改了文档。
	style：修改了代码的格式，不影响代码的逻辑。
	refactor：重构代码，不修复 bug 也不添加新功能。
	revert: 回滚。
	perf：提高性能。
	test：添加或修改测试用例。
	build：影响了构建过程和依赖关系。
	ci：修改了 CI 配置文件和脚本。
	chore：修改了项目维护任务，例如更新版本号。
*/
