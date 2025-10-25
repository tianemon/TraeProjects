import requests
from bs4 import BeautifulSoup
import time
import os
import json

# 设置请求头，模拟浏览器
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

def crawl_phone_prices():
    """
    爬取ZOL手机报价页面的信息
    """
    url = 'https://detail.zol.com.cn/cell_phone_index/subcate57_list_1.html'
    
    try:
        # 发送请求
        print(f"正在获取页面: {url}")
        response = requests.get(url, headers=headers, timeout=10)
        
        # 尝试不同的编码
        try:
            response.encoding = 'gbk'  # ZOL网站通常使用GBK编码
        except:
            response.encoding = response.apparent_encoding
        
        # 检查响应状态
        response.raise_for_status()
        
        # 解析HTML
        soup = BeautifulSoup(response.text, 'lxml')
        
        # 添加调试信息，查看页面的主要结构
        print("\n=== 页面结构调试信息 ===")
        print(f"页面标题: {soup.title.text if soup.title else '未找到标题'}")
        
        # 直接查找可能包含手机信息的元素 - 采用更有针对性的方法
        print("\n正在查找手机产品信息...")
        
        # 首先尝试查找带有价格的元素，这些更可能是手机产品
        phone_list = []
        price_elements = soup.find_all(['span', 'div'], string=lambda text: text and '¥' in text)
        
        # 收集这些价格元素的父级和祖先元素，它们可能包含完整的产品信息
        parent_elements = set()
        for price_elem in price_elements:
            # 获取父级元素
            parent = price_elem.parent
            if parent and len(parent.text.strip()) > 20:  # 确保有足够的文本内容
                parent_elements.add(parent)
            # 获取祖父级元素
            if parent and parent.parent and len(parent.parent.text.strip()) < 500:  # 不要太大
                parent_elements.add(parent.parent)
        
        # 如果找到了父级元素，使用它们
        if parent_elements:
            phone_list = list(parent_elements)
            print(f"找到 {len(phone_list)} 个可能包含手机产品信息的元素")
        else:
            # 备选方案：使用常见的选择器
            selectors = [
                '.search-list > li',  # 搜索列表项
                '.product-intro',     # 产品介绍
                '.item',              # 通用项
                '.goods-item',        # 商品项
                '.pro-intro'
            ]
            
            for selector in selectors:
                elements = soup.select(selector)
                if elements:
                    phone_list = elements
                    print(f"使用选择器 '{selector}' 找到 {len(phone_list)} 个元素")
                    break
        
        # 如果仍然没有找到，尝试最后的方法
        if not phone_list:
            print("尝试直接查找包含手机信息的元素...")
            phone_brands = ['Apple', '华为', '小米', 'OPPO', 'vivo', '荣耀', '一加', 'iQOO', '三星', '魅族']
            phone_items = []
            
            for tag in soup.find_all(['li', 'div', 'a']):
                text = tag.text.strip()
                if text and len(text) > 15 and len(text) < 500:
                    # 检查是否包含品牌名称或价格
                    if any(brand in text for brand in phone_brands) or '¥' in text:
                        phone_items.append(tag)
            
            if phone_items:
                phone_list = phone_items
                print(f"找到 {len(phone_list)} 个可能包含手机信息的元素")
            else:
                print("未找到任何手机相关信息")
                return
        
        print(f"\n使用找到的 {len(phone_list)} 个元素进行解析")
        
        # 存储数据
        data = []
        # 用于去重的集合
        seen_phones = set()
        
        for phone in phone_list:
            try:
                # 初始化信息
                name = '未知'
                price = '未知价格'
                link = '#'
                description = '无'
                score = '暂无评分'
                
                # 提取手机名称 - 尝试不同的选择器
                name_selectors = ['.name', 'h3', 'h4', '.product-name', '.title']
                for selector in name_selectors:
                    name_elem = phone.select_one(selector)
                    if name_elem and name_elem.text.strip():
                        name = name_elem.text.strip()
                        break
                
                # 如果没找到，尝试从文本中提取包含"手机"的部分
                if name == '未知':
                    text = phone.text.strip()
                    # 查找可能的手机型号名称
                    import re
                    # 尝试匹配常见的手机型号格式
                    pattern = r'[\u4e00-\u9fa5\w\-]+\s*[A-Za-z0-9]+[\u4e00-\u9fa5]*'
                    matches = re.findall(pattern, text)
                    if matches:
                        # 选择看起来最像手机名称的匹配项
                        for match in matches:
                            if len(match) > 3 and len(match) < 50:
                                name = match
                                break
                
                # 提取价格信息 - 尝试不同的选择器
                price_selectors = ['.price', '.price-type', '.price-box', '.cost']
                for selector in price_selectors:
                    price_elem = phone.select_one(selector)
                    if price_elem and price_elem.text.strip():
                        price_text = price_elem.text.strip()
                        # 提取价格部分
                        if '¥' in price_text:
                            price = price_text
                            break
                
                # 如果没找到，尝试从文本中提取价格
                if price == '未知价格':
                    import re
                    price_match = re.search(r'¥\s*\d+(?:\.\d+)?', phone.text)
                    if price_match:
                        price = price_match.group()
                
                # 提取链接
                link_elem = phone.select_one('a[href]')
                if link_elem and 'href' in link_elem.attrs:
                    href = link_elem['href']
                    if href.startswith('http'):
                        link = href
                    elif href.startswith('/'):
                        link = 'https://detail.zol.com.cn' + href
                
                # 提取配置信息
                desc_selectors = ['.param', '.specs', '.description', '.params']
                for selector in desc_selectors:
                    desc_elem = phone.select_one(selector)
                    if desc_elem and desc_elem.text.strip():
                        description = desc_elem.text.strip()
                        # 限制描述长度
                        if len(description) > 100:
                            description = description[:100] + '...'
                        break
                
                # 如果没找到配置信息，从文本中提取可能的配置信息
                if description == '无' and len(phone.text) > 50:
                    # 提取文本中可能包含配置信息的部分
                    text = phone.text.strip()
                    # 查找包含数字和规格相关词汇的部分
                    import re
                    spec_match = re.search(r'(\d+GB|\d+MB|\d+G|\d+M|\d+核|\d+英寸|\d+像素|\d+mAh).*?(\d+GB|\d+MB|\d+G|\d+M|\d+核|\d+英寸|\d+像素|\d+mAh)?', text)
                    if spec_match:
                        description = spec_match.group()
                
                # 提取评分
                score_selectors = ['.score', '.mark', '.rating']
                for selector in score_selectors:
                    score_elem = phone.select_one(selector)
                    if score_elem and score_elem.text.strip():
                        score = score_elem.text.strip()
                        break
                
                # 过滤条件：确保是有效的手机产品
                is_valid_phone = True
                
                # 过滤非手机产品
                invalid_keywords = ['首页', '筛选', '品牌', '大全', '更多', '相关推荐', '新品', '点评产品', 
                                   'RAM', 'ROM', '容量', '参数', '对比', '排行榜', '热门', '分类']
                for keyword in invalid_keywords:
                    if keyword in name:
                        is_valid_phone = False
                        break
                
                # 过滤数字或太短的名称
                if len(name) < 5 or name.isdigit():
                    is_valid_phone = False
                
                # 过滤没有有意义信息的条目
                if price == '未知价格' and description == '无' and score == '暂无评分':
                    is_valid_phone = False
                
                # 检查是否包含常见手机品牌关键词
                phone_brands = ['iPhone', '华为', 'HUAWEI', '小米', 'OPPO', 'vivo', '荣耀', '一加', 'iQOO', '三星', '魅族']
                has_brand = any(brand.lower() in name.lower() for brand in phone_brands)
                
                # 如果没有品牌关键词，但有价格和合理长度，也考虑为有效
                if not has_brand and price == '未知价格' and len(name) < 10:
                    is_valid_phone = False
                
                # 只有有效的手机产品才添加到数据中
                if is_valid_phone:
                    # 清理手机名称（移除重复的价格信息和多余空格）
                    import re
                    name = re.sub(r'¥\s*\d+(?:\.\d+)?', '', name).strip()
                    name = re.sub(r'\s+', ' ', name)  # 标准化空格
                    
                    # 创建用于去重的唯一键（基于名称和价格）
                    unique_key = f"{name}_{price}"
                    
                    # 检查是否已存在
                    if unique_key not in seen_phones:
                        seen_phones.add(unique_key)
                        data.append({
                            '手机名称': name,
                            '价格': price,
                            '链接': link,
                            '配置信息': description,
                            '评分': score
                        })
                
                print(f"已爬取: {name} - {price}")
                
            except Exception as e:
                print(f"解析单个手机信息时出错: {e}")
                continue
        
        # 保存到CSV和Excel文件
        if data:
            save_data(data)
        else:
            print("未能提取到任何手机数据")
            
    except requests.RequestException as e:
        print(f"请求页面时出错: {e}")
    except Exception as e:
        print(f"爬虫执行过程中出错: {e}")

def save_data(data):
    """
    保存爬取的数据为JSON格式
    """
    # 创建data目录（如果不存在）
    os.makedirs('data', exist_ok=True)
    
    # 生成文件名（包含时间戳）
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    json_file = f'data/phone_prices_{timestamp}.json'
    
    # 转换为只包含手机型号和价格的简化数据
    simplified_data = []
    for item in data:
        # 提取手机型号（包含存储信息）
        phone_model = item['手机名称']
        # 提取价格
        price = item['价格']
        
        # 清理价格格式，只保留数字
        import re
        price_match = re.search(r'¥?\s*([\d.]+)', price)
        if price_match:
            price_value = price_match.group(1)
        else:
            price_value = price
        
        simplified_data.append({
            '手机型号': phone_model,
            '价格': price_value
        })
    
    # 保存为JSON
    try:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(simplified_data, f, ensure_ascii=False, indent=2)
        print(f"数据已保存到JSON文件: {json_file}")
    except Exception as e:
        print(f"保存JSON文件失败: {e}")
    
    # 打印数据统计信息
    print(f"\n共爬取到 {len(simplified_data)} 款手机的信息")
    print("数据示例:")
    for i, item in enumerate(simplified_data[:5]):
        print(f"{i+1}. {item['手机型号']} - ¥{item['价格']}")

if __name__ == "__main__":
    print("开始爬取ZOL手机报价信息...")
    crawl_phone_prices()
    print("爬虫执行完毕!")