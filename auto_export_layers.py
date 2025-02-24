from psd_tools import PSDImage
from PIL import Image
import os
import sys
import tkinter as tk
from tkinter import ttk, messagebox
import threading

def get_application_path():
    # 获取实际运行目录
    if getattr(sys, 'frozen', False):
        # 如果是打包后的exe运行
        return os.path.dirname(sys.executable)
    else:
        # 如果是脚本运行
        return os.path.dirname(os.path.abspath(__file__))

class ExportApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PSD/PSB图层导出工具")
        self.root.geometry("400x200")
        
        # 创建界面元素
        self.status_label = ttk.Label(root, text="准备就绪")
        self.status_label.pack(pady=10)
        
        self.progress = ttk.Progressbar(root, length=300, mode='determinate')
        self.progress.pack(pady=10)
        
        self.detail_label = ttk.Label(root, text="")
        self.detail_label.pack(pady=10)
        
        # 创建按钮框架
        self.button_frame = ttk.Frame(root)
        self.button_frame.pack(pady=10)
        
        # 开始导出按钮
        self.start_button = ttk.Button(self.button_frame, text="开始导出", command=self.start_export)
        self.start_button.pack(side="left", padx=5)
        
        # 取消按钮（初始状态为禁用）
        self.cancel_button = ttk.Button(self.button_frame, text="取消", command=self.cancel_export, state="disabled")
        self.cancel_button.pack(side="left", padx=5)
        
        # 添加版权信息
        version_label = ttk.Label(root, text="v1.0", foreground="gray")
        version_label.pack(side="bottom", pady=5)
        
        # 添加取消标志
        self.is_cancelled = False
        
    def update_status(self, text):
        self.status_label.config(text=text)
        
    def update_detail(self, text):
        self.detail_label.config(text=text)
    
    def cancel_export(self):
        self.is_cancelled = True
        self.cancel_button.config(state="disabled")
        self.update_status("正在取消...")
        
    def start_export(self):
        # 重置取消标志
        self.is_cancelled = False
        # 禁用开始按钮，启用取消按钮
        self.start_button.config(state="disabled")
        self.cancel_button.config(state="normal")
        # 启动处理线程
        thread = threading.Thread(target=self.process_files)
        thread.start()
        
    def process_files(self):
        try:
            current_dir = get_application_path()
            design_files = find_psd_files(current_dir)
            
            if not design_files:
                messagebox.showinfo("提示", "没有找到PSD或PSB文件！")
                self.reset_buttons()
                return
            
            self.update_status(f"找到 {len(design_files)} 个设计文件")
            self.progress['maximum'] = len(design_files)
            
            success_count = 0
            for i, file_path in enumerate(design_files):
                # 检查是否被取消
                if self.is_cancelled:
                    self.update_status("已取消导出")
                    break
                    
                self.progress['value'] = i
                rel_path = os.path.relpath(file_path, start=current_dir)
                self.update_detail(f"正在处理: {rel_path}")
                
                if export_layers(file_path, self.update_detail):
                    success_count += 1
                
                self.root.update()
            
            self.progress['value'] = len(design_files)
            
            if not self.is_cancelled:
                self.update_status("处理完成！")
                self.update_detail(f"成功处理: {success_count}/{len(design_files)} 个文件")
                messagebox.showinfo("完成", f"处理完成！\n成功处理: {success_count}/{len(design_files)} 个文件\n文件保存在: {os.path.join(current_dir, 'exported_layers')}")
            
        except Exception as e:
            messagebox.showerror("错误", str(e))
        
        finally:
            self.reset_buttons()
    
    def reset_buttons(self):
        # 重置按钮状态
        self.start_button.config(state="normal")
        self.cancel_button.config(state="disabled")
        self.is_cancelled = False

def export_layers(psd_path, update_callback=None):
    try:
        # 读取PSD文件
        if update_callback:
            update_callback(f"开始处理文件: {psd_path}")
            
        # 修改打开方式，确保加载所有图层信息
        psd = PSDImage.open(psd_path, load_masks=True)
        if update_callback:
            update_callback(f"PSD文件加载成功，图层数量: {len(list(psd.descendants()))}")
        
        # 使用新的获取目录方法
        base_dir = get_application_path()
        rel_path = os.path.relpath(psd_path, start=base_dir)
        psd_name = os.path.splitext(os.path.basename(psd_path))[0]
        output_dir = os.path.join(base_dir, 'exported_layers', os.path.dirname(rel_path), psd_name)
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            if update_callback:
                update_callback(f"创建输出目录: {output_dir}")
        
        def should_skip_layer(layer_name):
            """检查图层是否应该跳过"""
            skip_keywords = ["不导出", "no-export", "noexport"]
            return any(keyword in str(layer_name).lower() for keyword in skip_keywords)
        
        def process_group(group, parent_path=""):
            if update_callback:
                group_name = getattr(group, 'name', '')
                if group_name:  # 只在有实际名称时显示
                    update_callback(f"处理组: {group_name}")
                
            # 直接处理所有图层，包括组内图层
            for layer in psd.descendants():
                try:
                    # 打印调试信息
                    if update_callback:
                        update_callback(f"发现图层: {layer.name} (可见性: {layer.is_visible()}, 是组: {layer.is_group()})")
                    
                    # 跳过不可见图层
                    if not layer.is_visible():
                        if update_callback:
                            update_callback(f"跳过不可见图层: {layer.name}")
                        continue
                    
                    # 跳过图层组
                    if layer.is_group():
                        if update_callback:
                            update_callback(f"跳过图层组: {layer.name}")
                        continue
                    
                    # 检查图层名称
                    if should_skip_layer(layer.name):
                        if update_callback:
                            update_callback(f"跳过图层: {layer.name} (标记为不导出)")
                        continue

                    try:
                        if update_callback:
                            update_callback(f"开始导出图层: {layer.name}")

                        # 跳过图层组
                        if layer.is_group():
                            continue

                        # 获取图层边界
                        bbox = layer.bbox
                        if bbox is None:
                            if update_callback:
                                update_callback(f"跳过空图层: {layer.name}")
                            continue

                        # 检查是否是文字图层
                        is_text = hasattr(layer, 'text_data') and layer.text_data is not None

                        # 导出图层
                        if is_text:
                            # 文字图层特殊处理
                            original_visibility = layer.visible
                            layer.visible = True
                            
                            # 确保导出包含效果的完整图层
                            layer_image = layer.compose(force=True)
                            
                            # 为文字图层添加额外边距
                            # 使用更大的基础边距和更高的比例
                            text_width = bbox.width
                            text_height = bbox.height
                            base_margin = 500  # 增加基础边距到500像素
                            margin_ratio = 2.0  # 使用2倍的文字尺寸
                            
                            # 计算最终边距
                            margin_x = max(base_margin, text_width * margin_ratio)
                            margin_y = max(base_margin, text_height * margin_ratio)
                            
                            # 计算新的边界，确保不超出画布范围
                            left = max(0, bbox.left - margin_x)
                            top = max(0, bbox.top - margin_y)
                            right = min(psd.width, bbox.right + margin_x)
                            bottom = min(psd.height, bbox.bottom + margin_y)
                            
                            # 裁剪图像
                            layer_image = layer_image.crop((left, top, right, bottom))
                            
                            # 恢复可见性
                            layer.visible = original_visibility
                        else:
                            # 普通图层，使用compose而不是composite
                            layer_image = layer.compose(force=True)

                        if layer_image is None:
                            if update_callback:
                                update_callback(f"图层导出失败: {layer.name}")
                            continue

                        if update_callback:
                            update_callback(f"图层导出成功: {layer.name}, 尺寸: {layer_image.width}x{layer_image.height}")

                        # 如果图层有透明通道，保持透明
                        if layer_image.mode == 'RGBA':
                            output_image = layer_image
                        else:
                            # 转换为RGBA模式
                            output_image = layer_image.convert('RGBA')

                        # 清理文件名（移除不合法字符）
                        safe_name = "".join([c for c in layer.name if c.isalnum() or c in (' ', '-', '_')]).strip()
                        if not safe_name:
                            safe_name = f"layer_{layer._index}"
                        
                        # 获取图层的完整路径（移除Root）
                        layer_path_parts = []
                        current = layer
                        while hasattr(current, 'parent') and current.parent is not None:
                            if (hasattr(current.parent, 'name') and 
                                current.parent.name and 
                                current.parent != psd):  # 跳过根组
                                layer_path_parts.insert(0, current.parent.name)
                            current = current.parent
                        
                        # 构建输出路径
                        current_output_dir = output_dir
                        if layer_path_parts:
                            current_output_dir = os.path.join(output_dir, *layer_path_parts)
                            if not os.path.exists(current_output_dir):
                                os.makedirs(current_output_dir)
                        
                        output_path = os.path.join(current_output_dir, f"{safe_name}.png")
                        
                        # 保存图层
                        output_image.save(output_path, 'PNG')
                        
                        if update_callback:
                            # 显示相对路径而不是完整路径
                            rel_output_path = os.path.relpath(output_path, output_dir)
                            update_callback(f"已保存图层: {rel_output_path}")
                            
                    except Exception as e:
                        if update_callback:
                            update_callback(f"处理图层 '{layer.name}' 时出错: {str(e)}")
                            import traceback
                            update_callback(traceback.format_exc())
                        continue
                        
                except Exception as e:
                    if update_callback:
                        update_callback(f"处理图层 '{layer.name}' 时出错: {str(e)}")
                        import traceback
                        update_callback(traceback.format_exc())
        
        # 开始处理所有图层
        process_group(psd)
        if update_callback:
            update_callback("处理完成")
        return True
        
    except Exception as e:
        if update_callback:
            update_callback(f"处理文件 '{psd_path}' 时出错: {str(e)}")
            import traceback
            update_callback(traceback.format_exc())
        return False

def find_psd_files(directory):
    """递归查找所有PSD和PSB文件"""
    design_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(('.psd', '.psb')):
                design_files.append(os.path.join(root, file))
    return design_files

def main():
    root = tk.Tk()
    app = ExportApp(root)
    root.mainloop()

if __name__ == "__main__":
    main() 