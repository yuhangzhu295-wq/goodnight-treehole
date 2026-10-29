import os
import shutil
import zipfile
import json

project_root = r"C:\Users\zyu33\Projects\goodnight-treehole"
desktop_dir = r"C:\Users\zyu33\Desktop"
stage_dir = os.path.join(project_root, "artifacts", "temp_zip_stage")

if os.path.exists(stage_dir):
    shutil.rmtree(stage_dir)
os.makedirs(stage_dir, exist_ok=True)

# Define items and categories
categories_map = {
    '核心树洞': '01_核心树洞',
    '同路人互助': '02_同路人互助',
    '心理支持工具': '03_心理支持工具',
    '信箱与归档': '04_信箱与归档',
    '个人与隐私': '05_个人与隐私',
    '管理运营后台': '06_管理运营后台'
}

for cat_folder in categories_map.values():
    os.makedirs(os.path.join(stage_dir, cat_folder), exist_ok=True)

queue_path = os.path.join(project_root, "docs", "design-v2", "UI_V2_MASTER_QUEUE.json")
with open(queue_path, "r", encoding="utf-8") as f:
    queue = json.load(f)

tasks = queue.get("tasks", [])

name_map = {
  'UI-V2-01': ('今夜主页', '核心树洞', '/pages/tonight/index', '情绪倾诉输入、树洞日记与心情回声'),
  'UI-V2-02': ('同路人网络', '同路人互助', '/pages/peers/index', '相近经历推荐流与真实同路人匹配'),
  'UI-V2-03': ('行动整理中心', '心理支持工具', '/pages/action/index', '焦虑待办整理与分步行动卡片'),
  'UI-V2-04': ('我的主页', '个人与隐私', '/pages/me/index', '个人主页、数据概览与设置入口'),
  'UI-V2-05': ('情绪旅程', '核心树洞', '/pages/journey/detail', '情绪历程时间轴、温度变化与阶段确认'),
  'UI-V2-06': ('经历详情', '同路人互助', '/pages/peer/detail', '查看同路人详细经历并申请 1v1 连接'),
  'UI-V2-07': ('连接申请', '同路人互助', '/pages/peer/requests', '收到的同路人倾诉申请列表与审批'),
  'UI-V2-08': ('等待回应', '同路人互助', '/pages/peer/wait', '申请发出后的等待响应与撤回状态'),
  'UI-V2-09': ('知情同意', '同路人互助', '/pages/peer/consent', '倾诉互助规范授权与隐私承诺'),
  'UI-V2-10': ('1对1 私密对话', '同路人互助', '/pages/peer/conversation', '双向授权私密倾诉房间与安全引导'),
  'UI-V2-11': ('结伴毕业', '同路人互助', '/pages/peer/graduate', '互助完成双向评价与温情告别'),
  'UI-V2-12': ('现实交接', '心理支持工具', '/pages/reality-handoff/index', '向现实亲友求助的便签模板库'),
  'UI-V2-13': ('紧急安全支持', '心理支持工具', '/pages/safety/index', '120/12356危机专线与安全指引'),
  'UI-V2-14': ('通知中心', '个人与隐私', '/pages/notifications/index', '系统互动、信件送达提醒中心'),
  'UI-V2-15': ('写给未来的信', '信箱与归档', '/pages/future-self/index', '时空慢递写信与到期送达阅读'),
  'UI-V2-16': ('生活节奏恢复', '心理支持工具', '/pages/recovery/index', '作息与身体微习惯唤醒打卡'),
  'UI-V2-17': ('支持计划', '心理支持工具', '/pages/support-plan/index', '个性化情绪平复阶段性支持方案'),
  'UI-V2-18': ('稳定自我中心', '心理支持工具', '/pages/stable-self/index', '4-4-6-2呼吸法动态指导与着陆练习'),
  'UI-V2-19': ('记忆与整理偏好', '个人与隐私', '/pages/memory/index', 'AI 对话偏好与历史记忆清除控制'),
  'UI-V2-20': ('决策保险箱', '心理支持工具', '/pages/decision/index', '冲动决策冷处理与多维度权衡分析'),
  'UI-V2-21': ('情绪档案库', '信箱与归档', '/pages/archive/index', '历史树洞、日记、信件一体化归档'),
  'UI-V2-22': ('树洞广场', '核心树洞', '/pages/square/index', '匿名动态浏览、排序筛选与回抱共鸣'),
  'UI-V2-23': ('发布心情树洞', '核心树洞', '/pages/mood/create', '情绪录入、心情标签与可见度控制'),
  'UI-V2-24': ('树洞动态详情', '核心树洞', '/pages/post/detail', '单条树洞深度浏览与温暖回应互动'),
  'UI-V2-25': ('今日来信', '信箱与归档', '/pages/letter/index', '每日温暖来信与心灵抚慰'),
  'UI-V2-26': ('心理工具箱', '心理支持工具', '/pages/tool/index', '心理疏导与自我关怀工具分类导航'),
  'UI-V2-27': ('任务拆解助手', '心理支持工具', '/pages/tool/decompose', '巨型焦虑任务的微行动分步拆解'),
  'UI-V2-28': ('工具即时运行', '心理支持工具', '/pages/tool/run', 'AI辅助情绪改写、便签微调与实时生成'),
  'UI-V2-29': ('个人资料与凭证', '个人与隐私', '/pages/me/profile', '昵称头像微调与安全凭证管理'),
  'UI-V2-30': ('私密日记列表', '信箱与归档', '/pages/diary/index', '个人私密日记卡片瀑布流'),
  'UI-V2-31': ('日记正文详情', '信箱与归档', '/pages/diary/detail', '日记正文、情绪温度记录与回味'),
  'UI-V2-32': ('情绪月度月报', '信箱与归档', '/pages/report/month', '情绪波动趋势图表与心理韧性统计'),
  'UI-V2-33': ('信箱往来列表', '信箱与归档', '/pages/letter/list', '收到与寄出的历史信件分类检索'),
  'UI-V2-34': ('信件精美详情', '信箱与归档', '/pages/letter/detail', '慢递信件精美排版正文浏览'),
  'UI-V2-35': ('我的暖心珍藏', '信箱与归档', '/pages/favorite/index', '珍藏回信、暖心语录分类管理'),
  'UI-V2-36': ('隐私权限设置', '个人与隐私', '/pages/settings/privacy', '匿名保护、防打扰与数据清除'),
  'UI-V2-37': ('数据安全政策', '个人与隐私', '/pages/settings/data-policy', '隐私条例与端到端数据擦除保障'),
  'UI-V2-38': ('帮助与工单反馈', '个人与隐私', '/pages/help/feedback', '意见反馈提交与客服工单流转'),
  'UI-V2-39': ('常见问题 FAQ', '个人与隐私', '/pages/help/faqs', '使用指南与常见困惑解答')
}

admin_items = [
  ('ADM-01', '后台身份登录', '管理运营后台', '/login', '管理员安全登录鉴权', 'artifacts/screenshots/admin/01-admin-login-1440.png'),
  ('ADM-02', '运营数据大盘', '管理运营后台', '/dashboard', '核心指标、情绪趋势与活跃大盘', 'artifacts/screenshots/admin/02-admin-dashboard-1440.png'),
  ('ADM-03', '用户与账号管理', '管理运营后台', '/users', '真实用户账户管理与凭证合规', 'artifacts/screenshots/admin/03-admin-user-list-1440.png'),
  ('ADM-04', '树洞内容审核', '管理运营后台', '/posts', '广场动态人工审核与合规处置', 'artifacts/screenshots/admin/04-admin-post-content-1440.png'),
  ('ADM-05', '互动回复审核', '管理运营后台', '/replies', '互动留言过滤与敏感词拦截', 'artifacts/screenshots/admin/05-admin-reply-moderation-1440.png'),
  ('ADM-06', 'AI 渠道中心', '管理运营后台', '/ai-providers', '多大模型服务渠道健康与配额监控', 'artifacts/screenshots/admin/06-admin-ai-provider-center-1440.png'),
  ('ADM-07', 'AI 策略路由', '管理运营后台', '/ai-routes', '任务模型分流与智能降级编排', 'artifacts/screenshots/admin/07-admin-ai-style-routing-1440.png'),
  ('ADM-08', 'AI 任务流水日志', '管理运营后台', '/ai-jobs', '全链路异步 AI 任务生成与耗时监控', 'artifacts/screenshots/admin/08-admin-ai-job-log-1440.png'),
  ('ADM-09', '用户反馈工单', '管理运营后台', '/feedback', '用户问题、求助与意见跟进流转', 'artifacts/screenshots/admin/09-admin-feedback-ticket-1440.png'),
  ('ADM-10', '系统与安全配置', '管理运营后台', '/config', '全站运行参数、安全域名与白名单管理', 'artifacts/screenshots/admin/10-admin-system-settings-1440.png')
]

doc_lines = [
    "# 🌙《晚安树洞》（Goodnight Treehole）全项目功能与页面截图索引\n",
    "本压缩包收录了《晚安树洞》全项目 49 个核心功能与页面的**高清晰度原始真机实测截图**，按照业务板块分类归档。\n",
    "## 目录结构说明\n",
    "- `01_核心树洞/`：今夜倾诉主页、情绪历程时间轴、广场动态、树洞发布与详情（共 5 张）",
    "- `02_同路人互助/`：同路人经历匹配、申请、知情同意、1对1私密对话与毕业（共 7 张）",
    "- `03_心理支持工具/`：行动整理、现实交接便签、120/12356危机专线、4-4-6-2呼吸法、决策保险箱、任务拆解等（共 10 张）",
    "- `04_信箱与归档/`：写给未来的信、今日来信、私密日记瀑布流、情绪月报、慢递信件排版、珍藏与总档案（共 9 张）",
    "- `05_个人与隐私/`：个人主页、资料凭证、通知中心、记忆清除控制、隐私安全政策与FAQ解答（共 8 张）",
    "- `06_管理运营后台/`：运营大盘、用户管理、树洞审核、AI渠道与策略路由、工单与系统配置（共 10 张）\n",
    "## 详细页面与功能清单\n"
]

copied_count = 0

# Copy C-end tasks
for t in tasks:
    tid = t.get('id')
    info = name_map.get(tid)
    if not info:
        continue
    title, category, route, desc = info
    cat_folder = categories_map[category]
    src_sc = t.get('screenshot')
    src_path = os.path.join(project_root, src_sc)
    
    if not os.path.exists(src_path):
        print(f"Warning: file not found {src_path}")
        continue
        
    safe_title = title.replace('/', '_').replace(' ', '_')
    dst_filename = f"{tid}_{safe_title}.png"
    dst_path = os.path.join(stage_dir, cat_folder, dst_filename)
    
    shutil.copy2(src_path, dst_path)
    copied_count += 1
    doc_lines.append(f"- **[{tid}] {title}** ({category})\n  - 对应路由: `{route}`\n  - 功能说明: {desc}\n  - 归档文件: `{cat_folder}/{dst_filename}`\n")

# Copy Admin tasks
doc_lines.append("\n### 运营管理后台（Admin 桌面端管控）\n")
for adm in admin_items:
    aid, title, category, route, desc, src_sc = adm
    cat_folder = categories_map[category]
    src_path = os.path.join(project_root, src_sc)
    
    if not os.path.exists(src_path):
        print(f"Warning: file not found {src_path}")
        continue
        
    safe_title = title.replace('/', '_').replace(' ', '_')
    dst_filename = f"{aid}_{safe_title}.png"
    dst_path = os.path.join(stage_dir, cat_folder, dst_filename)
    
    shutil.copy2(src_path, dst_path)
    copied_count += 1
    doc_lines.append(f"- **[{aid}] {title}** ({category})\n  - 对应路由: `{route}`\n  - 功能说明: {desc}\n  - 归档文件: `{cat_folder}/{dst_filename}`\n")

# Write README.md in stage_dir
with open(os.path.join(stage_dir, "README.md"), "w", encoding="utf-8") as f:
    f.writelines("\n".join(doc_lines))

print(f"Copied {copied_count} files into staging directory.")

# Create zip archive
zip_name = "晚安树洞_全项目功能与页面真机截图"
zip_base = os.path.join(project_root, "artifacts", zip_name)
shutil.make_archive(zip_base, "zip", stage_dir)
final_zip = zip_base + ".zip"

print(f"Created zip archive: {final_zip} ({os.path.getsize(final_zip) / (1024*1024):.2f} MB)")

# Copy to Desktop
desktop_zip = os.path.join(desktop_dir, zip_name + ".zip")
shutil.copy2(final_zip, desktop_zip)
print(f"Copied zip to Desktop: {desktop_zip}")

# Clean up stage dir
shutil.rmtree(stage_dir)
print("Cleaned up staging directory.")
