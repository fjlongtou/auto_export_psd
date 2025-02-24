#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');
const psd2fgui = require("./psd2gfui.js");

// 修改配置文件路径常量
const CONFIG_FILE = 'psd2gfuiconfig.json';

/**
 * 读取配置文件
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = fs.readJsonSync(CONFIG_FILE);
            return {
                projectPath: config.projectPath || '',
                packageName: config.packageName || '',
                psdDir: config.psdDir || './psd',
                editorPath: config.editorPath || '',  // 只从配置读取
                projectName: config.projectName || 'test'
            };
        }
    } catch (err) {
        console.warn('读取配置文件失败:', err.message);
    }
    return {
        projectPath: '',
        packageName: '',
        psdDir: './psd',
        editorPath: '',  // 默认为空
        projectName: 'test'
    };
}

/**
 * 保存配置文件
 */
function saveConfigFile(config) {
    try {
        const configToSave = {
            projectPath: config.projectPath || '',
            packageName: config.packageName || '',
            psdDir: config.psdDir || './psd',
            editorPath: config.editorPath || '',
            projectName: config.projectName || 'test'
        };
        fs.writeJsonSync(CONFIG_FILE, configToSave, { spaces: 2 });
        console.log('配置已保存到:', CONFIG_FILE);
    } catch (err) {
        console.warn('保存配置文件失败:', err.message);
    }
}

/**
 * 创建FairyGUI项目文件结构
 */
function createFGUIProject(projectPath, packageName) {
    const config = loadConfig();
    const projectFile = path.join(projectPath, `${config.projectName}.fairy`);
    
    // 如果项目文件已存在，只需要创建包目录
    if (fs.existsSync(projectFile)) {
        // 创建包目录
        const packagePath = path.join(projectPath, 'assets', packageName);
        fs.ensureDirSync(packagePath);
        return;
    }

    // FairyGUI编辑器路径
    const editorPath = config.editorPath;
    
    if (!editorPath || !fs.existsSync(editorPath)) {
        console.error('找不到FairyGUI编辑器，请在配置文件中设置正确的editorPath');
        console.error('配置文件路径:', CONFIG_FILE);
        throw new Error('找不到FairyGUI编辑器');
    }

    // 使用FairyGUI命令行创建项目
    const { spawn } = require('child_process');
    try {
        // 创建项目目录结构
        fs.ensureDirSync(projectPath);
        fs.ensureDirSync(path.join(projectPath, 'assets'));
        fs.ensureDirSync(path.join(projectPath, 'settings'));
        fs.ensureDirSync(path.join(projectPath, '.objs'));
        
        // 创建包目录
        const packagePath = path.join(projectPath, 'assets', packageName);
        fs.ensureDirSync(packagePath);

        // 创建项目文件
        fs.writeFileSync(projectFile, '');

        // 执行创建项目命令
        console.log('正在创建项目...');
        const createProject = spawn(editorPath, [
            '--project', projectPath,
            '--create-project',
            '--headless'
        ], { windowsHide: true });

        // 添加输出监听
        createProject.stdout.on('data', (data) => {
            // console.log(`项目创建输出: ${data}`);
        });

        createProject.stderr.on('data', (data) => {
            console.error(`项目创建错误: ${data}`);
        });

        createProject.on('error', (err) => {
            console.error('创建项目失败:', err);
            throw err;
        });

        // 增加超时时间到30秒
        const timeout = setTimeout(() => {
            createProject.kill();
            console.log('创建项目完成（超时）');
            
            // 创建包
            console.log('正在创建包...');
            const createPackage = spawn(editorPath, [
                '--project', projectPath,
                '--create-package', packageName,
                '--headless'
            ], { windowsHide: true });

            // 添加包创建输出监听
            createPackage.stdout.on('data', (data) => {
                // console.log(`包创建输出: ${data}`);
            });

            createPackage.stderr.on('data', (data) => {
                console.error(`包创建错误: ${data}`);
            });

            createPackage.on('error', (err) => {
                console.error('创建包失败:', err);
                throw err;
            });

            // 增加包创建超时时间到30秒
            const packageTimeout = setTimeout(() => {
                createPackage.kill();
                console.log('创建包完成（超时）');
            }, 30000);

            createPackage.on('exit', (code) => {
                clearTimeout(packageTimeout);
                console.log(`创建包完成，退出码: ${code}`);
            });

        }, 30000);

        createProject.on('exit', (code) => {
            clearTimeout(timeout);
            console.log(`创建项目完成，退出码: ${code}`);
        });

        console.log(`已创建FairyGUI项目: ${projectPath}`);
        console.log(`已创建包: ${packageName}`);
    } catch (err) {
        console.error('创建项目失败:', err);
        throw err;
    }
}

/**
 * 检查文件是否为支持的格式
 */
function isSupportedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.psd' || ext === '.psb';
}

/**
 * 监视目录变化并自动转换
 */
function watchDirectory(srcDir, projectPath, packageName, option) {
    const chokidar = require('chokidar');
    
    try {
        // 转换为绝对路径
        const absoluteSrcDir = path.resolve(srcDir);
        const absoluteProjectPath = path.resolve(projectPath);
        
        // 确保源目录和项目目录都存在，并创建项目文件
        try {
            fs.ensureDirSync(absoluteSrcDir);
            createFGUIProject(absoluteProjectPath, packageName);
        } catch (err) {
            console.error('创建目录或项目失败');
            console.error(err);
            throw err;
        }
        
        console.log(`开始监视目录: ${absoluteSrcDir}`);
        console.log(`目标项目: ${absoluteProjectPath}`);
        console.log(`目标包名: ${packageName}`);
        console.log('监视 PSD/PSB 文件变化...');
        console.log('按 Ctrl+C 退出监视');

        const watcher = chokidar.watch(absoluteSrcDir, {
            ignored: /(^|[\/\\])\../, // 忽略隐藏文件
            persistent: true
        });

        let converting = false;
        let pendingFiles = [];

        function processNextFile() {
            if (pendingFiles.length > 0 && !converting) {
                converting = true;
                const filePath = pendingFiles.shift();
                convertFile(filePath, projectPath, packageName, option)
                    .finally(async () => {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        converting = false;
                        if (pendingFiles.length > 0) {
                            processNextFile();
                        }
                        console.log('\n继续监视中... 按 Ctrl+C 退出');
                    });
            }
        }

        watcher.on('add', path => {
            if (isSupportedFile(path)) {
                console.log(`发现新文件: ${path}`);
                pendingFiles.push(path);
                processNextFile();
            }
        });

        watcher.on('change', path => {
            if (isSupportedFile(path)) {
                console.log(`文件已更新: ${path}`);
                pendingFiles.push(path);
                processNextFile();
            }
        });

        // 添加退出处理
        process.on('SIGINT', () => {
            console.log('\n正在关闭监视...');
            watcher.close().then(() => {
                console.log('监视已关闭');
                process.exit(0);
            });
        });

        // 初始扫描完成
        watcher.on('ready', () => {
            if (pendingFiles.length === 0) {
                console.log('等待PSD/PSB文件变化...');
            }
        });

        // 添加错误处理
        watcher.on('error', error => {
            console.error('监视错误:', error);
        });

    } catch (err) {
        console.error('启动监视失败:', err);
        throw err;
    }
}

/**
 * 转换单个文件
 */
function convertFile(psdFile, projectPath, packageName, option) {
    console.log(`正在转换: ${psdFile}`);
    
    // 转换为绝对路径
    const absolutePsdPath = path.resolve(psdFile);
    const absoluteProjectPath = path.resolve(projectPath);
    
    // 确保项目目录存在并创建项目文件
    try {
        createFGUIProject(absoluteProjectPath, packageName);
    } catch (err) {
        console.error(`创建项目失败: ${absoluteProjectPath}`);
        console.error(err);
        process.exit(1);
    }
    
    // 转换PSD到包目录
    const packagePath = path.join(absoluteProjectPath, 'assets', packageName);
    return new Promise((resolve, reject) => {
        psd2fgui.convertToProject(absolutePsdPath, packagePath, packageName, option)
            .then(async (buildId) => {
                console.log(`转换成功: ${absolutePsdPath}`);
                console.log(`buildId: ${buildId}`);
                
                // 等待一段时间确保文件系统操作完成
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (process.argv[2] === 'convert') {
                    console.log('所有操作完成，准备退出...');
                    process.exit(0);
                }
                resolve(buildId);
            })
            .catch(async (err) => {
                console.error(`转换失败: ${absolutePsdPath}`);
                console.error(err);
                
                // 等待错误信息输出
                await new Promise(resolve => setTimeout(resolve, 1000));
                process.exit(1);
            });
    });
}

/**
 * 主函数
 */
function main() {
    try {
        const config = loadConfig();
        const args = process.argv.slice(2);

        // 如果没有参数，默认使用watch模式
        if (args.length === 0) {
            console.log('正在启动监视模式...');
            const psdDir = config.psdDir;
            const projectPath = config.projectPath;
            const packageName = config.packageName;
            const editorPath = config.editorPath;

            // 验证配置
            if (!projectPath || !packageName || !editorPath) {
                console.error('错误: 配置文件缺少必要参数');
                console.error('请在配置文件中设置以下参数：');
                console.error('  projectPath: 项目路径');
                console.error('  packageName: 包名');
                console.error('  editorPath: FairyGUI编辑器路径');
                console.error('配置文件路径:', CONFIG_FILE);
                throw new Error('配置错误');
            }

            // 验证编辑器路径
            if (!fs.existsSync(editorPath)) {
                console.error('错误: 找不到FairyGUI编辑器');
                console.error('请在配置文件中设置正确的editorPath');
                console.error('当前路径:', editorPath);
                throw new Error('找不到编辑器');
            }

            // 启动监视模式
            watchDirectory(psdDir, projectPath, packageName, 0);
            return;
        }

        // 原有的命令行处理逻辑
        if (args[0] === '--help' || args[0] === '-h') {
            console.log('使用方法:');
            console.log('  监视模式: node run.js watch');
            console.log('  单文件模式: node run.js convert [PSD/PSB文件]');
            console.log('');
            console.log('支持的文件格式:');
            console.log('  - PSD (Photoshop文档)');
            console.log('  - PSB (Photoshop大文档)');
            console.log('');
            console.log('选项:');
            console.log('  --save-config    保存当前配置为默认值');
            console.log('');
            console.log('配置文件:', CONFIG_FILE);
            console.log('当前配置:');
            console.log('  项目路径:', config.projectPath);
            console.log('  包名:', config.packageName);
            console.log('  PSD目录:', config.psdDir);
            console.log('  编辑器路径:', config.editorPath);
            console.log('  项目名称:', config.projectName);
            console.log('');
            console.log('示例:');
            console.log('  node run.js watch');
            console.log('  node run.js convert ./ui.psd');
            process.exit(0);
        }

        let mode = args[0];
        let srcPath = args[1];
        let shouldSaveConfig = false;
        let option = 0;

        // 从配置文件读取所有参数
        let projectPath = config.projectPath;
        let packageName = config.packageName;
        let psdDir = config.psdDir;
        let editorPath = config.editorPath;
        let projectName = config.projectName;

        // 只保留--save-config参数
        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--save-config') {
                shouldSaveConfig = true;
            }
        }

        // 如果没有指定源目录，使用配置中的psdDir
        if (!srcPath && mode === 'watch') {
            srcPath = psdDir;
        }

        // 验证配置
        if (!projectPath || !packageName || !editorPath) {
            console.error('错误: 配置文件缺少必要参数');
            console.error('请在配置文件中设置以下参数：');
            console.error('  projectPath: 项目路径');
            console.error('  packageName: 包名');
            console.error('  editorPath: FairyGUI编辑器路径');
            console.error('配置文件路径:', CONFIG_FILE);
            process.exit(1);
        }

        // 验证编辑器路径
        if (!fs.existsSync(editorPath)) {
            console.error('错误: 找不到FairyGUI编辑器');
            console.error('请在配置文件中设置正确的editorPath');
            console.error('当前路径:', editorPath);
            process.exit(1);
        }

        // 执行转换
        switch (mode) {
            case 'watch':
                watchDirectory(srcPath, projectPath, packageName, option);
                break;
            
            case 'convert':
                if (!srcPath) {
                    console.error('错误: 请指定要转换的PSD文件');
                    console.error('示例: node run.js convert ./ui.psd');
                    process.exit(1);
                }
                convertFile(srcPath, projectPath, packageName, option);
                break;
            
            default:
                console.error('错误: 未知的模式');
                console.error('使用方法: node run.js watch|convert');
                process.exit(1);
        }
    } catch (err) {
        console.error('\n发生错误:', err.message);
        console.error('\n按任意键退出...');
        
        // 等待用户按键后退出
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, 0));
    }
}

// 添加进程异常处理
process.on('uncaughtException', (err) => {
    console.error('\n未捕获的错误:', err.message);
    console.error('\n按任意键退出...');
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 1));
});

// 运行主函数
main(); 