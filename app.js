/**
 * LifeOS 主逻辑：页面切换、打卡记录、技能经验值
 */

// localStorage 键名
const STORAGE_LOGS = 'lifeos_logs';
const STORAGE_SKILLS = 'lifeos_skills';

// 技能配置：id、名称、关键词列表
const SKILL_CONFIG = [
  {
    id: 'coding',
    name: '编程',
    keywords: [
      '编程', '代码', '开发', 'python', 'javascript', 'java', 'react', 'vue',
      'numpy', '算法', 'git', 'api', '前端', '后端', '调试', '函数', '库',
    ],
  },
  {
    id: 'reading',
    name: '阅读',
    keywords: [
      '阅读', '读书', '书', '小说', '散文', '章节', '页', '图书馆', '电子书',
      '名著', '文献', '杂志',
    ],
  },
  {
    id: 'sport',
    name: '运动',
    keywords: [
      '运动', '跑步', '健身', '游泳', '瑜伽', '篮球', '足球', '骑行', '徒步',
      '拉伸', '有氧', '力量', '公里', '步数',
    ],
  },
  {
    id: 'language',
    name: '语言',
    keywords: [
      '英语', '日语', '法语', '德语', '韩语', '单词', '口语', '听力', '语法',
      '翻译', '外语', '雅思', '托福', '语言',
    ],
  },
  {
    id: 'writing',
    name: '写作',
    keywords: [
      '写作', '写', '文章', '日记', '博客', '稿', '文案', '随笔', '笔记', '创作',
      '修辞', '段落',
    ],
  },
];

const MAX_LEVEL = 10;
const BASE_XP_PER_LOG = 15;

/** 每级所需经验（累计到该级起点） */
function xpForLevel(level) {
  return (level - 1) * 100;
}

/** 当前等级内进度 0–1 */
function levelProgress(xp, level) {
  if (level >= MAX_LEVEL) return 1;
  const current = xp - xpForLevel(level);
  const needed = xpForLevel(level + 1) - xpForLevel(level);
  return Math.min(1, Math.max(0, current / needed));
}

/** 根据经验计算等级 */
function calcLevel(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

/** 读取技能数据，若无则初始化 */
function loadSkills() {
  try {
    const raw = localStorage.getItem(STORAGE_SKILLS);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* 忽略解析错误 */
  }
  const initial = {};
  SKILL_CONFIG.forEach((s) => {
    initial[s.id] = { xp: 0, level: 1 };
  });
  return initial;
}

/** 保存技能数据 */
function saveSkills(skills) {
  localStorage.setItem(STORAGE_SKILLS, JSON.stringify(skills));
}

/** 读取打卡记录 */
function loadLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_LOGS);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* 忽略 */
  }
  return [];
}

/** 保存打卡记录 */
function saveLogs(logs) {
  localStorage.setItem(STORAGE_LOGS, JSON.stringify(logs));
}

/** 根据文本匹配技能 id 列表 */
function matchSkills(text) {
  const lower = text.toLowerCase();
  const matched = [];
  SKILL_CONFIG.forEach((skill) => {
    const hit = skill.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hit) matched.push(skill.id);
  });
  return matched;
}

/** 为匹配到的技能增加经验，返回升级了的技能 id（无匹配则不加分） */
function grantXp(skillIds) {
  if (skillIds.length === 0) return [];

  const skills = loadSkills();
  const leveledUp = [];

  skillIds.forEach((id) => {
    if (!skills[id]) skills[id] = { xp: 0, level: 1 };
    const prevLevel = skills[id].level;
    skills[id].xp += BASE_XP_PER_LOG;
    skills[id].level = calcLevel(skills[id].xp);
    if (skills[id].level > prevLevel) leveledUp.push(id);
  });

  saveSkills(skills);
  return leveledUp;
}

/** 格式化时间显示 */
function formatTime(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** 切换视图 */
function switchView(viewName) {
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('view--active', el.dataset.view === viewName);
  });
  document.querySelectorAll('.nav__item').forEach((el) => {
    const active = el.dataset.nav === viewName;
    el.classList.toggle('nav__item--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

/** 渲染历史记录列表（时间倒序） */
function renderLogList() {
  const listEl = document.getElementById('log-list');
  const emptyEl = document.getElementById('log-empty');
  const logs = loadLogs().sort((a, b) => new Date(b.time) - new Date(a.time));

  listEl.innerHTML = '';

  if (logs.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  logs.forEach((log) => {
    const li = document.createElement('li');
    li.className = 'log-item';
    li.dataset.id = log.id;

    const skillTags =
      log.skills && log.skills.length
        ? log.skills
            .map((id) => SKILL_CONFIG.find((s) => s.id === id)?.name)
            .filter(Boolean)
            .join(' · ')
        : '';

    li.innerHTML = `
      <div class="log-item__main">
        <time class="log-item__time" datetime="${log.time}">${formatTime(log.time)}</time>
        <p class="log-item__content">${escapeHtml(log.content)}</p>
        ${skillTags ? `<span class="log-item__tags">${escapeHtml(skillTags)}</span>` : ''}
      </div>
      <button type="button" class="btn btn--ghost log-item__delete" aria-label="删除记录">删除</button>
    `;

    li.querySelector('.log-item__delete').addEventListener('click', () => {
      deleteLog(log.id);
    });

    listEl.appendChild(li);
  });
}

/** 防止 XSS 的简单转义 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 删除一条记录 */
function deleteLog(id) {
  const logs = loadLogs().filter((l) => l.id !== id);
  saveLogs(logs);
  renderLogList();
}

/** 提交打卡 */
function submitLog() {
  const input = document.getElementById('log-input');
  const content = input.value.trim();
  if (!content) {
    input.focus();
    return;
  }

  const matched = matchSkills(content);
  const leveledUp = grantXp(matched);

  const entry = {
    id: crypto.randomUUID(),
    content,
    time: new Date().toISOString(),
    skills: matched,
  };

  const logs = loadLogs();
  logs.push(entry);
  saveLogs(logs);

  input.value = '';
  renderLogList();
  renderSkillTree(leveledUp);

  if (leveledUp.length > 0) {
    showLevelUpToast(leveledUp);
  }
}

/** 升级提示 */
function showLevelUpToast(skillIds) {
  const names = skillIds
    .map((id) => {
      const s = SKILL_CONFIG.find((c) => c.id === id);
      const skills = loadSkills();
      return s ? `${s.name} Lv.${skills[id].level}` : '';
    })
    .filter(Boolean)
    .join('、');

  let toast = document.querySelector('.level-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'level-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = `升级了！${names}`;
  toast.classList.add('level-toast--show');
  setTimeout(() => toast.classList.remove('level-toast--show'), 2800);
}

/** 渲染技能树；leveledUpIds 触发等级高亮动画 */
function renderSkillTree(leveledUpIds = []) {
  const container = document.getElementById('skill-tree');
  const skills = loadSkills();

  container.innerHTML = SKILL_CONFIG.map((skill) => {
    const data = skills[skill.id] || { xp: 0, level: 1 };
    const progress = levelProgress(data.xp, data.level);
    const pct = Math.round(progress * 100);
    const atMax = data.level >= MAX_LEVEL;
    const levelClass = leveledUpIds.includes(skill.id) ? ' skill-card__level--up' : '';

    return `
      <article class="skill-card" data-skill="${skill.id}">
        <div class="skill-card__head">
          <h3 class="skill-card__name">${skill.name}</h3>
          <span class="skill-card__level${levelClass}" data-level>Lv.${data.level}</span>
        </div>
        <div class="skill-card__bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="skill-card__fill" style="width: ${atMax ? 100 : pct}%"></div>
        </div>
        <p class="skill-card__xp">${atMax ? '已满级' : `${data.xp} XP · ${pct}%`}</p>
      </article>
    `;
  }).join('');

  if (leveledUpIds.length > 0) {
    setTimeout(() => {
      container.querySelectorAll('.skill-card__level--up').forEach((el) => {
        el.classList.remove('skill-card__level--up');
      });
    }, 1200);
  }
}

/** 模块占位提示 */
function showModuleToast(name) {
  let toast = document.querySelector('.level-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'level-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = `「${name}」模块规划中，敬请期待`;
  toast.classList.add('level-toast--show');
  setTimeout(() => toast.classList.remove('level-toast--show'), 2000);
}

/** 初始化导航与事件 */
function init() {
  document.querySelectorAll('.nav__item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.nav;
      switchView(view);
      if (view === 'stats') renderSkillTree();
      if (view === 'log') renderLogList();
    });
  });

  // 首页模块卡片目前为占位，点击给出提示而非无反应
  document.querySelectorAll('.card[data-module]').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const title = card.querySelector('.card__title');
      showModuleToast(title ? title.textContent.trim() : '该模块');
    });
  });

  const submitBtn = document.getElementById('log-submit');
  if (submitBtn) submitBtn.addEventListener('click', submitLog);

  const input = document.getElementById('log-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitLog();
    });
  }

  renderLogList();
  renderSkillTree();
}

document.addEventListener('DOMContentLoaded', init);
