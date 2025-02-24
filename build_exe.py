import PyInstaller.__main__
import os

# 获取当前目录
current_dir = os.path.dirname(os.path.abspath(__file__))

PyInstaller.__main__.run([
    'auto_export_layers.py',    # 主脚本
    '--onefile',                # 打包成单个exe文件
    '--noconsole',             # 不显示控制台窗口
    '--name=PSD图层导出工具',    # exe文件名
    '--add-data=README.txt;.',  # 添加说明文件
    '--icon=icon.ico',          # 添加图标
]) 