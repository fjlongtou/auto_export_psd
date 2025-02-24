from PIL import Image, ImageDraw, ImageFont
import os

def create_icon():
    # 创建一个512x512的图像（支持多种尺寸）
    sizes = [(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)]
    images = []
    
    for size in sizes:
        # 创建新图像，使用RGBA模式支持透明度
        img = Image.new('RGBA', size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 绘制圆形背景
        circle_size = min(size[0], size[1])
        circle_pos = ((size[0] - circle_size) // 2, (size[1] - circle_size) // 2)
        draw.ellipse([circle_pos[0], circle_pos[1], 
                     circle_pos[0] + circle_size, circle_pos[1] + circle_size], 
                     fill=(65, 105, 225))  # 蓝色
        
        # 添加文字
        try:
            # 计算合适的字体大小
            font_size = int(circle_size * 0.6)
            font = ImageFont.truetype("arial.ttf", font_size)
            text = "P"
            
            # 获取文字大小
            text_bbox = draw.textbbox((0, 0), text, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            
            # 计算文字位置（居中）
            x = (size[0] - text_width) // 2
            y = (size[1] - text_height) // 2
            
            # 绘制文字
            draw.text((x, y), text, fill="white", font=font)
            
        except Exception:
            # 如果无法加载字体，使用默认字体
            font_size = int(circle_size * 0.6)
            draw.text((size[0]//3, size[1]//3), "P", fill="white")
        
        images.append(img)
    
    # 保存为ICO文件
    images[0].save("icon.ico", format="ICO", sizes=sizes)
    print("图标文件已创建：icon.ico")

if __name__ == "__main__":
    create_icon() 