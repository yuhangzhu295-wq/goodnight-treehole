import os
import json
import base64
import io
from PIL import Image

project_root = r"C:\Users\zyu33\Projects\goodnight-treehole"
vis_dir = r"C:\Users\zyu33\.zcode\v2\visualizations\6b7de010d033f3d629cb71a0d05e06a7cf6fd0d5e33d87adc3952272f50080d8"
out_html = os.path.join(vis_dir, "treehole-all-pages-gallery.html")

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

cards = []

for t in tasks:
    tid = t.get('id')
    info = name_map.get(tid, (t.get('page'), '其他', t.get('route'), ''))
    sc = t.get('screenshot')
    full_path = os.path.join(project_root, sc)
    if not os.path.exists(full_path):
        continue
    
    img = Image.open(full_path)
    w, h = img.size
    new_w = 200
    new_h = int(h * (new_w / w))
    img_res = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    buf = io.BytesIO()
    img_res.convert('RGB').save(buf, format='JPEG', quality=68)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    
    cards.append({
        'id': tid,
        'title': info[0],
        'category': info[1],
        'route': info[2],
        'desc': info[3],
        'type': 'mobile',
        'img': f'data:image/jpeg;base64,{b64}',
        'local_path': sc.replace('\\', '/')
    })

for adm in admin_items:
    full_path = os.path.join(project_root, adm[5])
    if not os.path.exists(full_path):
        continue
    img = Image.open(full_path)
    w, h = img.size
    new_w = 260
    new_h = int(h * (new_w / w))
    img_res = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    buf = io.BytesIO()
    img_res.convert('RGB').save(buf, format='JPEG', quality=65)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    
    cards.append({
        'id': adm[0],
        'title': adm[1],
        'category': adm[2],
        'route': adm[3],
        'desc': adm[4],
        'type': 'desktop',
        'img': f'data:image/jpeg;base64,{b64}',
        'local_path': adm[5].replace('\\', '/')
    })

print(f"Total processed cards: {len(cards)}")

cards_json = json.dumps(cards, ensure_ascii=False)

html_content = f"""<div id="treehole-gallery-app" class="treehole-gallery-container">
  <style>
    #treehole-gallery-app {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      padding: 16px 0;
      color: var(--foreground, #1e293b);
    }}
    .thg-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }}
    .thg-title {{
      font-size: 18px;
      font-weight: 600;
      color: var(--foreground, #0f172a);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .thg-badge {{
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.12);
      color: #6366f1;
    }}
    .thg-tabs {{
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }}
    .thg-tab-btn {{
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid var(--border, #e2e8f0);
      background: var(--background, #fff);
      color: var(--muted-foreground, #64748b);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }}
    .thg-tab-btn:hover {{
      color: var(--foreground, #0f172a);
      border-color: #6366f1;
    }}
    .thg-tab-btn.active {{
      background: #6366f1;
      color: #ffffff;
      border-color: #6366f1;
      font-weight: 500;
    }}
    .thg-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 16px;
    }}
    .thg-card {{
      background: var(--card, #ffffff);
      border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }}
    .thg-card:hover {{
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.08);
      border-color: #a5b4fc;
    }}
    .thg-card-preview {{
      width: 100%;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      border-bottom: 1px solid var(--border, #f1f5f9);
      min-height: 280px;
    }}
    .thg-card-preview.desktop {{
      min-height: 160px;
      padding: 8px;
    }}
    .thg-card-preview img {{
      max-width: 100%;
      max-height: 320px;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }}
    .thg-card-preview.desktop img {{
      max-height: 150px;
    }}
    .thg-card-body {{
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }}
    .thg-card-meta {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }}
    .thg-card-id {{
      font-family: monospace;
      font-size: 11px;
      color: #6366f1;
      font-weight: 600;
    }}
    .thg-card-category {{
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--muted, #f1f5f9);
      color: var(--muted-foreground, #64748b);
    }}
    .thg-card-title {{
      font-size: 14px;
      font-weight: 600;
      color: var(--foreground, #0f172a);
      margin-bottom: 4px;
    }}
    .thg-card-route {{
      font-family: monospace;
      font-size: 11px;
      color: var(--muted-foreground, #94a3b8);
      margin-bottom: 6px;
    }}
    .thg-card-desc {{
      font-size: 12px;
      color: var(--muted-foreground, #475569);
      line-height: 1.4;
      flex: 1;
    }}
    .thg-modal {{
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    }}
    .thg-modal.open {{
      display: flex;
    }}
    .thg-modal-content {{
      background: var(--card, #ffffff);
      border-radius: 16px;
      max-width: 900px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      position: relative;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    }}
    .thg-modal-close {{
      position: absolute;
      top: 14px;
      right: 14px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }}
    .thg-modal-body {{
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }}
    .thg-modal-img-wrap {{
      flex: 1;
      min-width: 280px;
      display: flex;
      justify-content: center;
      background: #f1f5f9;
      padding: 16px;
      border-radius: 12px;
    }}
    .thg-modal-img-wrap img {{
      max-width: 100%;
      max-height: 68vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }}
    .thg-modal-info {{
      flex: 1;
      min-width: 260px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}
    .thg-modal-h2 {{
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }}
  </style>

  <div class="thg-header">
    <div class="thg-title">
      <span>🌙《晚安树洞》全项目功能与页面全景真机截图画廊</span>
      <span class="thg-badge">共 49 个全覆盖功能视图</span>
    </div>
    <div style="font-size: 12px; color: var(--muted-foreground, #64748b);">
      包含 C 端移动端 39 页真机全景 + B 端运营后台 10 个桌面管控视图
    </div>
  </div>

  <div class="thg-tabs" id="thg-category-tabs"></div>

  <div class="thg-grid" id="thg-cards-container"></div>

  <div class="thg-modal" id="thg-lightbox-modal">
    <div class="thg-modal-content">
      <button type="button" class="thg-modal-close" id="thg-modal-close-btn">&times;</button>
      <div class="thg-modal-body">
        <div class="thg-modal-img-wrap">
          <img id="thg-modal-img" src="" alt="预览图" />
        </div>
        <div class="thg-modal-info">
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="thg-badge" id="thg-modal-id"></span>
            <span class="thg-card-category" id="thg-modal-category"></span>
          </div>
          <h2 class="thg-modal-h2" id="thg-modal-title"></h2>
          <div class="thg-card-route" id="thg-modal-route"></div>
          <div style="font-size: 13px; line-height: 1.6;" id="thg-modal-desc"></div>
          <div style="margin-top: auto; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            本地文件路径：<br><code id="thg-modal-path" style="word-break: break-all;"></code>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {{
      const cards = {cards_json};
      const categories = ['全部 (49)', '核心树洞', '同路人互助', '心理支持工具', '信箱与归档', '个人与隐私', '管理运营后台'];
      let activeCategory = '全部 (49)';

      const tabsContainer = document.getElementById('thg-category-tabs');
      const cardsContainer = document.getElementById('thg-cards-container');
      const modal = document.getElementById('thg-lightbox-modal');
      const modalClose = document.getElementById('thg-modal-close-btn');
      const modalImg = document.getElementById('thg-modal-img');
      const modalTitle = document.getElementById('thg-modal-title');
      const modalId = document.getElementById('thg-modal-id');
      const modalCategory = document.getElementById('thg-modal-category');
      const modalRoute = document.getElementById('thg-modal-route');
      const modalDesc = document.getElementById('thg-modal-desc');
      const modalPath = document.getElementById('thg-modal-path');

      function renderTabs() {{
        tabsContainer.innerHTML = '';
        categories.forEach(cat => {{
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'thg-tab-btn' + (cat === activeCategory ? ' active' : '');
          btn.textContent = cat;
          btn.onclick = () => {{
            activeCategory = cat;
            renderTabs();
            renderCards();
          }};
          tabsContainer.appendChild(btn);
        }});
      }}

      function renderCards() {{
        cardsContainer.innerHTML = '';
        const filtered = cards.filter(c => {{
          if (activeCategory.startsWith('全部')) return true;
          return c.category === activeCategory;
        }});

        filtered.forEach(item => {{
          const card = document.createElement('div');
          card.className = 'thg-card';
          card.innerHTML = `
            <div class="thg-card-preview ${{item.type}}">
              <img src="${{item.img}}" alt="${{item.title}}" loading="lazy" />
            </div>
            <div class="thg-card-body">
              <div class="thg-card-meta">
                <span class="thg-card-id">${{item.id}}</span>
                <span class="thg-card-category">${{item.category}}</span>
              </div>
              <div class="thg-card-title">${{item.title}}</div>
              <div class="thg-card-route">${{item.route}}</div>
              <div class="thg-card-desc">${{item.desc}}</div>
            </div>
          `;
          card.onclick = () => openModal(item);
          cardsContainer.appendChild(card);
        }});
      }}

      function openModal(item) {{
        modalImg.src = item.img;
        modalTitle.textContent = item.title;
        modalId.textContent = item.id;
        modalCategory.textContent = item.category;
        modalRoute.textContent = '路由: ' + item.route;
        modalDesc.textContent = item.desc;
        modalPath.textContent = item.local_path;
        modal.classList.add('open');
      }}

      modalClose.onclick = () => modal.classList.remove('open');
      modal.onclick = (e) => {{
        if (e.target === modal) modal.classList.remove('open');
      }};

      renderTabs();
      renderCards();
    }})();
  </script>
</div>
"""

with open(out_html, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Written HTML gallery to: {out_html}")
print(f"File size: {os.path.getsize(out_html) / 1024:.1f} KB")
