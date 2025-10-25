import pandas as pd
import json
import os
import re
from datetime import datetime

def extract_phone_model_and_price(csv_file):
    """
    从CSV文件中提取手机型号(含存储大小)和价格信息
    """
    try:
        # 读取CSV文件
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
        print(f"成功读取文件: {csv_file}")
        print(f"文件包含 {len(df)} 条记录")
        
        # 存储提取的信息
        phone_data = []
        
        for index, row in df.iterrows():
            # 获取手机名称和价格
            phone_name = str(row.get('手机名称', '')).strip()
            price = str(row.get('价格', '')).strip()
            
            # 过滤无效数据
            if not phone_name or phone_name == '未知' or price == '未知价格':
                continue
            
            # 尝试从手机名称中提取型号和存储信息
            # 常见的存储格式: (12GB/256GB), 12GB+256GB, 12+256GB等
            storage_patterns = [
                r'\((\d+GB?/\d+GB?)\)',  # (12GB/256GB)格式
                r'(\d+GB?\+\d+GB?)',     # 12GB+256GB格式
                r'(\d+GB?\s*[-×x]\s*\d+GB?)'  # 12GB-256GB或12GB×256GB格式
            ]
            
            model_name = phone_name
            storage_info = ''
            
            # 尝试匹配存储信息
            for pattern in storage_patterns:
                match = re.search(pattern, phone_name)
                if match:
                    storage_info = match.group(1)
                    # 提取型号名称（去除存储信息部分）
                    model_name = re.sub(pattern, '', phone_name).strip()
                    # 去除可能的额外括号或空格
                    model_name = model_name.rstrip('（）').strip()
                    break
            
            # 清理型号名称（移除多余的描述信息）
            # 移除常见的描述性文本
            descriptors = ['蔡司', '蓝图', '影像', '双芯', '骁龙', '天玑', '电池', '系统', 
                          '超清', '智能', '电竞', '芯片', '珠峰', '屏', 'YOYO', '智能体', 
                          '夜神', '长焦', '第五代', '至尊版', '领先版', '青海湖', 'AI', '鹰眼',
                          '相机', '冰川', '绿洲', '护眼', '巨犀', '玻璃']
            
            for desc in descriptors:
                model_name = model_name.replace(desc, '').strip()
                # 移除多余的空格和标点
                model_name = re.sub(r'\s+', ' ', model_name)
                model_name = re.sub(r'[,，。.\s]+$', '', model_name)
            
            # 构建最终的手机型号（包含存储信息）
            if storage_info:
                final_model = f"{model_name}({storage_info})"
            else:
                # 如果没有找到存储信息，保留原始型号
                final_model = model_name
            
            # 清理价格信息（只保留数字和小数点）
            price_number = re.search(r'¥?\s*([\d.]+)', price)
            if price_number:
                final_price = price_number.group(1)
            else:
                final_price = price
            
            # 只添加有效的数据
            if len(final_model) > 3 and final_price and not final_price.isalpha():
                phone_data.append({
                    '手机型号': final_model,
                    '价格': final_price
                })
        
        # 去重
        unique_data = []
        seen = set()
        for item in phone_data:
            key = f"{item['手机型号']}_{item['价格']}"
            if key not in seen:
                seen.add(key)
                unique_data.append(item)
        
        print(f"成功提取 {len(unique_data)} 条有效手机信息")
        return unique_data
        
    except Exception as e:
        print(f"处理文件时出错: {e}")
        return []

def find_latest_csv():
    """
    查找data目录下最新的CSV文件
    """
    data_dir = 'data'
    if not os.path.exists(data_dir):
        print(f"数据目录不存在: {data_dir}")
        return None
    
    # 获取所有CSV文件
    csv_files = [f for f in os.listdir(data_dir) if f.endswith('.csv')]
    if not csv_files:
        print("未找到CSV文件")
        return None
    
    # 按照文件名中的时间戳排序
    csv_files.sort(reverse=True)
    latest_file = csv_files[0]
    
    return os.path.join(data_dir, latest_file)

def save_to_json(data, output_file):
    """
    将数据保存为JSON文件
    """
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"JSON文件已保存到: {output_file}")
        return True
    except Exception as e:
        print(f"保存JSON文件时出错: {e}")
        return False

if __name__ == "__main__":
    print("开始生成手机价格JSON文件...")
    
    # 查找最新的CSV文件
    latest_csv = find_latest_csv()
    if not latest_csv:
        print("无法找到CSV文件，程序退出")
        exit(1)
    
    print(f"使用最新的CSV文件: {latest_csv}")
    
    # 提取手机信息
    phone_data = extract_phone_model_and_price(latest_csv)
    
    if not phone_data:
        print("未能提取到有效数据，程序退出")
        exit(1)
    
    # 生成输出文件名（使用时间戳）
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_json = f'data/phone_prices_{timestamp}.json'
    
    # 确保data目录存在
    os.makedirs('data', exist_ok=True)
    
    # 保存为JSON文件
    if save_to_json(phone_data, output_json):
        print("\n数据提取和保存完成!")
        print(f"共提取 {len(phone_data)} 款手机的信息")
        print("\n数据示例:")
        # 打印前5个示例
        for i, item in enumerate(phone_data[:5]):
            print(f"{i+1}. {item['手机型号']} - ¥{item['价格']}")
    else:
        print("数据保存失败")