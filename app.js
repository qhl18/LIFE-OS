/**
 * LifeOS 主逻辑 — 三大板块：个人目标、贵人如云、既往也咎
 * 纯本地 localStorage 模式
 * v2: 成熟 App 级视觉与交互升级
 */

// ============================================================
// localStorage 键名
// ============================================================
const STORAGE_GOALS    = 'lifeos_goals';
const STORAGE_NOBLE    = 'lifeos_noble';
const STORAGE_TIMELINE = 'lifeos_timeline';
const STORAGE_LESSONS  = 'lifeos_lessons';
const STORAGE_REVIEWS  = 'lifeos_reviews';
const STORAGE_MOTTOS   = 'lifeos_mottos';
const STORAGE_DAILY    = 'lifeos_daily';
const STORAGE_REMINDERS_READ = 'lifeos_reminders_read';
const STORAGE_ONBOARDED = 'lifeos_onboarded';
const STORAGE_PROFILE   = 'lifeos_profile';
const STORAGE_THEME     = 'lifeos_theme';
const STORAGE_MY_TEMPLATES = 'lifeos_my_templates';
const STORAGE_GOAL_TEACHING = 'lifeos_goal_teaching_dismissed';
const STORAGE_COACH_SHOWN = 'lifeos_composite_coach_shown';

// 默认激励语
const DEFAULT_MOTTOS = {
  motto_goals: '所有事都不是急躁能做好的，要有很大的坚持性和忍耐力，才能到达最后的胜利',
  motto_noble: '亲情，爱情，友情亦或只是相识一场都是生命的礼物',
  motto_past:  '我常常回头看，以此来提醒我也很厉害地走过这么长的路',
};

var MOTTO_MAX = 60;

// ============================================================
// 通用工具
// ============================================================

function loadJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return fallback;
}

function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(iso) {
  var d = new Date(iso);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function todayKey() {
  return formatDate(new Date().toISOString());
}

function daysBetween(d1, d2) {
  var ms = new Date(d2) - new Date(d1);
  return Math.ceil(ms / 86400000);
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============================================================
// Toast — 三色 + 右上角滑入 + 2.5s 消失
// ============================================================

var TOAST_ICONS = {
  success: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
  warning: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  error:   '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
};

var _toastTimer = null;
var _toastUndoTimer = null;
var _toastUndoCallback = null;

function showToast(text, type, opts) {
  type = type || 'success';
  opts = opts || {};

  var toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  var html = (TOAST_ICONS[type] || TOAST_ICONS.success) + '<span>' + escapeHtml(text) + '</span>';

  // 撤销按钮
  if (opts.undo) {
    html += '<button class="toast__undo" type="button">撤销</button>';
    _toastUndoCallback = opts.undo;
  }

  toast.className = 'toast toast--' + type;
  toast.innerHTML = html;
  toast.classList.add('toast--show');

  // 撤销事件
  var undoBtn = toast.querySelector('.toast__undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', function() {
      clearTimeout(_toastUndoTimer);
      if (_toastUndoCallback) _toastUndoCallback();
      _toastUndoCallback = null;
      toast.classList.remove('toast--show');
      showToast('已撤销', 'success');
    });
  }

  clearTimeout(_toastTimer);
  var duration = opts.duration || 2500;
  _toastTimer = setTimeout(function() {
    toast.classList.remove('toast--show');
    _toastUndoCallback = null;
  }, duration);

  // 如果有撤销，延长到 10 秒
  if (opts.undo) {
    clearTimeout(_toastTimer);
    _toastUndoTimer = _toastTimer = setTimeout(function() {
      toast.classList.remove('toast--show');
      _toastUndoCallback = null;
    }, 10000);
  }
}

// ============================================================
// 确认弹窗（删除二次确认）
// ============================================================

function confirmDelete(title, desc, onConfirm) {
  var modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title || '确认删除？';
  document.getElementById('confirm-desc').textContent = desc || '此操作不可撤销';

  // 清除旧绑定
  var okBtn = document.getElementById('confirm-ok');
  var newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);

  newOk.addEventListener('click', function() {
    modal.hidden = true;
    if (onConfirm) onConfirm();
  });

  modal.hidden = false;
  // 自动聚焦取消按钮（更安全）
  setTimeout(function() {
    var cancelBtn = modal.querySelector('[data-close-confirm]');
    if (cancelBtn) cancelBtn.focus();
  }, 50);

  trapFocus(modal);
}

// ============================================================
// 弹窗焦点管理 — Esc 关闭 + Tab 锁定 + 自动聚焦
// ============================================================

var _activeFocusTrap = null;

function trapFocus(modal) {
  // 清除上一个
  if (_activeFocusTrap) _activeFocusTrap.cleanup();

  var focusable = modal.querySelectorAll(
    'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  var first = focusable[0];
  var last = focusable[focusable.length - 1];

  // 自动聚焦第一个输入框
  setTimeout(function() {
    var firstInput = modal.querySelector('input:not([type=hidden]), textarea, select');
    if (firstInput) firstInput.focus();
  }, 100);

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAnyModal(modal);
      return;
    }
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  modal.addEventListener('keydown', onKeydown);

  _activeFocusTrap = {
    modal: modal,
    cleanup: function() {
      modal.removeEventListener('keydown', onKeydown);
      _activeFocusTrap = null;
    }
  };
}

function closeAnyModal(modal) {
  modal.hidden = true;
  if (_activeFocusTrap) {
    _activeFocusTrap.cleanup();
  }
}

// ============================================================
// 视图切换 — 150ms 淡入位移
// ============================================================

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(function(el) {
    el.classList.remove('view--active');
  });
  document.querySelectorAll('.nav__item').forEach(function(el) {
    var active = el.dataset.nav === viewName;
    el.classList.toggle('nav__item--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  var target = document.querySelector('.view[data-view="' + viewName + '"]');
  if (target) {
    // 触发重绘以重启动画
    void target.offsetWidth;
    target.classList.add('view--active');
  }

  if (viewName === 'goals') {
    renderGoals();
    // 显示教学条
    var teachingBar = document.getElementById('goal-teaching-bar');
    if (teachingBar) {
      var dismissed = localStorage.getItem(STORAGE_GOAL_TEACHING);
      teachingBar.hidden = !!dismissed;
    }
  }
  if (viewName === 'noble') renderNoble();
  if (viewName === 'past')  renderPast();
  if (viewName === 'stats') renderStats();
  if (viewName === 'home')  renderTodayPanel();
  if (viewName === 'companion') renderCompanion();
  if (viewName === 'dashboard') renderDashboard();
  // 滚动到顶
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// 激励语 — 统一编辑交互（悬停铅笔 + input + 同步 + 阻止冒泡）
// ============================================================

function getMotto(key) {
  var mottos = loadJSON(STORAGE_MOTTOS, {});
  return mottos[key] || DEFAULT_MOTTOS[key] || '';
}

function setMotto(key, val) {
  var mottos = loadJSON(STORAGE_MOTTOS, {});
  mottos[key] = val;
  saveJSON(STORAGE_MOTTOS, mottos);
}

function refreshAllMottos(key) {
  document.querySelectorAll('.motto-wrap[data-key]').forEach(function(el) {
    if (key && el.dataset.key !== key) return;
    var textEl = el.querySelector('.motto-text');
    if (textEl && !el.classList.contains('editing')) {
      textEl.textContent = getMotto(el.dataset.key);
    }
  });
}

function initMottos() {
  // 初始渲染
  refreshAllMottos();

  document.querySelectorAll('.motto-wrap').forEach(function(wrap) {
    var key = wrap.dataset.key;
    var textEl = wrap.querySelector('.motto-text');
    var pencilEl = wrap.querySelector('.motto-pencil');

    // 点击文字或铅笔进入编辑
    function enterEdit(e) {
      e.preventDefault();
      e.stopPropagation();

      if (wrap.classList.contains('editing')) return;
      wrap.classList.add('editing');

      var currentVal = getMotto(key);
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'motto-input';
      input.value = currentVal;
      input.maxLength = MOTTO_MAX;

      // 隐藏文字和铅笔
      textEl.style.display = 'none';
      if (pencilEl) pencilEl.style.display = 'none';

      wrap.appendChild(input);
      input.focus();
      input.select();

      function save() {
        var val = input.value.trim();
        if (!val) val = currentVal; // 空则保留原值
        if (val.length > MOTTO_MAX) val = val.substring(0, MOTTO_MAX);
        setMotto(key, val);
        wrap.classList.remove('editing');
        input.remove();
        textEl.style.display = '';
        if (pencilEl) pencilEl.style.display = '';
        // 同步刷新所有同 key 的位置
        refreshAllMottos(key);
        showToast('激励语已更新', 'success');
      }

      function cancel() {
        wrap.classList.remove('editing');
        input.remove();
        textEl.style.display = '';
        if (pencilEl) pencilEl.style.display = '';
      }

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });

      input.addEventListener('blur', save);

      // 阻止 input 内的点击冒泡到卡片
      input.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    }

    textEl.addEventListener('click', enterEdit);
    if (pencilEl) pencilEl.addEventListener('click', enterEdit);

    // hover 时整个 wrap 不触发卡片跳转
    wrap.addEventListener('click', function(e) {
      if (wrap.classList.contains('editing')) {
        e.stopPropagation();
      }
    });
  });
}

// ============================================================
// 个人目标
// ============================================================

function loadGoals() { return loadJSON(STORAGE_GOALS, []); }
function saveGoals(g) { saveJSON(STORAGE_GOALS, g); }

// ---- 进度计算 ----
function calcProgress(goal) {
  if (goal.type === 'composite') {
    return calcCompositeProgress(goal);
  }
  if (goal.type === 'milestone') {
    if (!goal.milestones || goal.milestones.length === 0) return 0;
    var done = goal.milestones.filter(function(m) { return m.done; }).length;
    return done / goal.milestones.length;
  }
  if (goal.type === 'value') {
    var total = goal.target - goal.startVal;
    if (total === 0) return 1;
    var did = goal.currentValue - goal.startVal;
    var p = did / total;
    // 方向自动适配
    if (total < 0) p = -p; // 下降型
    return Math.min(1, Math.max(0, p));
  }
  // 累计型 / 习惯型
  if (!goal.target || goal.target === 0) return 0;
  return Math.min(1, (goal.currentValue || 0) / goal.target);
}

// ---- 复合目标进度（加权平均）----
function calcCompositeProgress(goal) {
  if (!goal.children || goal.children.length === 0) return 0;
  var totalWeight = 0;
  var weightedSum = 0;
  goal.children.forEach(function(c) {
    var w = c.weight || 1;
    totalWeight += w;
    weightedSum += calcProgress(c) * w;
  });
  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

// ---- 连续打卡 streak ----
function calcStreak(checkins) {
  if (!checkins || checkins.length === 0) return 0;
  var daySet = {};
  checkins.forEach(function(c) { if (c.date) daySet[c.date] = true; });
  var cursor = new Date();
  cursor.setHours(0,0,0,0);
  if (!daySet[formatDate(cursor.toISOString())]) {
    cursor.setDate(cursor.getDate() - 1);
  }
  var streak = 0;
  while (daySet[formatDate(cursor.toISOString())]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---- 节奏灯算法：需求速率 vs 实际速率 ----
function calcPace(goal) {
  if (goal.completed) return null;
  if (!goal.deadline) return null; // 无截止日期 = 灰灯

  var remainingDays = daysBetween(new Date(), goal.deadline);
  if (remainingDays <= 0) return 'red'; // 逾期

  // 剩余量
  var progress = calcProgress(goal);
  var remaining;
  if (goal.type === 'milestone') {
    remaining = goal.milestones.filter(function(m) { return !m.done; }).length;
  } else if (goal.type === 'value') {
    remaining = Math.abs(goal.target - (goal.currentValue || 0));
  } else {
    remaining = (goal.target || 0) - (goal.currentValue || 0);
  }

  if (remaining <= 0) return 'green';

  // 需求速率 = 剩余量 / 剩余天数
  var requiredRate = remaining / remainingDays;

  // 实际速率 = 近7天打卡量 / 7
  var now = new Date();
  var sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  var recentSum = 0;
  (goal.checkins || []).forEach(function(c) {
    if (new Date(c.date) >= sevenAgo) {
      if (goal.type === 'value') {
        // 数值型用最后值减七天前值
        recentSum = (goal.currentValue || 0) - (goal.currentValue || 0); // 简化
      } else {
        recentSum += (c.amount || 0);
      }
    }
  });

  // 对于数值型，用近7天变化量
  if (goal.type === 'value') {
    var weekAgoVal = getValueAtDaysAgo(goal, 7);
    recentSum = Math.abs((goal.currentValue || 0) - weekAgoVal);
    var totalChange = Math.abs(goal.target - goal.startVal);
    if (totalChange === 0) return 'green';
    // 归一化：近7天变化量占总量比例 vs 7天占剩余天数比例
    var actualRate = recentSum / 7;
    var requiredRateNorm = Math.abs(remaining) / remainingDays;
    var ratio = actualRate / requiredRateNorm;
  } else {
    var ratio = recentSum / 7 / requiredRate;
  }

  if (ratio >= 1) return 'green';
  if (ratio >= 0.7) return 'yellow';
  return 'red';
}

// 获取N天前的累计值（用于数值型节奏灯）
function getValueAtDaysAgo(goal, days) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var checkins = (goal.checkins || []).filter(function(c) {
    return new Date(c.date) < cutoff;
  });
  if (checkins.length === 0) return goal.startVal || 0;
  // 取截止日期之前最后一条打卡的 cumulative 值
  return checkins[checkins.length - 1].cumulative || goal.startVal || 0;
}

// ---- 倒计时 ----
function calcCountdown(deadline) {
  if (!deadline) return null;
  var days = daysBetween(new Date(), deadline);
  if (days < 0) return { overdue: true, days: Math.abs(days) };
  return { overdue: false, days: days };
}

// ---- 环形进度 SVG ----
function ringSVG(progress, size) {
  size = size || 64;
  var r = (size - 12) / 2;
  var circ = 2 * Math.PI * r;
  var offset = circ * (1 - Math.min(1, Math.max(0, progress)));
  return (
    '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '">' +
        '<circle class="ring__bg" cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '"/>' +
        '<circle class="ring__fill" cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '"' +
          ' stroke-dasharray="' + circ + '" stroke-dashoffset="' + offset + '"/>' +
      '</svg>' +
      '<div class="ring__text">' + Math.round(progress * 100) + '%</div>' +
    '</div>'
  );
}

// 空状态 SVG
var EMPTY_SVGS = {
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  noble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 17.8 5.7 21l2.3-7-6-4.6h7.6L12 2z"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  lesson: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
};

function emptyStateHTML(svgKey, text, btnText, btnId) {
  return '<div class="empty-state">' +
    '<div class="empty-state__icon">' + (EMPTY_SVGS[svgKey] || EMPTY_SVGS.goal) + '</div>' +
    '<p class="empty-state__text">' + escapeHtml(text) + '</p>' +
    (btnText ? '<button class="btn btn--primary btn--small empty-state__action" id="' + btnId + '">' + escapeHtml(btnText) + '</button>' : '') +
  '</div>';
}

// ---- 节奏灯 tooltip 文案 ----
var PACE_TOOLTIPS = {
  green: '绿灯：实际速率达标或超前，节奏良好',
  yellow: '黄灯：实际速率达到需求的70%~100%，需要加速',
  red: '红灯：实际速率低于需求的70%，严重掉队',
  gray: '无截止日期，不设节奏约束',
};
var PACE_LABELS = { green: '超前', yellow: '勉强', red: '掉队', gray: '无期限' };

// ---- 鼓励语库（≥15条）----
var ENCOURAGE_LIB = [
  '+1。就是这么一点点来的',
  '记下这一笔，未来的你会感谢现在',
  '又近了一步，别小看这一步',
  '你今天动了，这就是证据',
  '不是每一步都踩得稳，但你踩了',
  '积少成多不是空话，你正在做',
  '今天的你，比昨天的你多走了一点',
  '习惯不是一天养成的，但今天是其中一天',
  '你看，其实没那么难',
  '这一笔，记下了就是你的',
  '有人在暗中看着你努力，那个人是你自己',
  '不用完美，只需持续',
  '这一步很小，但方向对了',
  '你正在成为你想成为的人',
  '今天的努力，是明天的底气',
  '做完比做好更重要，你做完了',
  '不必比较，你的节奏就是最好的节奏',
];

function randomEncourage() {
  return ENCOURAGE_LIB[Math.floor(Math.random() * ENCOURAGE_LIB.length)];
}

// ---- 人话评语引擎 ----
function humanComment(goal) {
  if (goal.completed) return '做到了。这句话本身就是证据';
  if (goal.paused) return '在休息，不是放弃';

  if (goal.type === 'composite') {
    if (!goal.children || goal.children.length === 0) return '把它拆小，每一块就都有了进度';
    var progress = calcCompositeProgress(goal);
    if (progress >= 0.8) return '快要到了，每一步都算数';
    if (progress >= 0.5) return '过半了，最难的那段已经过去了';
    if (progress > 0) return '开始了，就已经赢了没开始的时候';
    return '把它拆小，每一块就都有了进度';
  }

  var progress = calcProgress(goal);
  var streak = calcStreak(goal.checkins || []);
  var pace = calcPace(goal);

  // 久未打卡检测（≥3天）
  var lastCheckinDate = getLastCheckinDate(goal);
  var daysSince = lastCheckinDate ? daysBetween(lastCheckinDate, todayKey()) : 999;
  if (daysSince >= 3) {
    return '它还在等你，随时开始都不算晚';
  }

  // 评语按状态轮换
  if (pace === 'green') return '跑在时间前面，稳';
  if (streak >= 7) return '节奏刚好，继续保持';
  if (pace === 'yellow') return '差一点点，一次打卡就回来';
  if (progress >= 0.5) return '背完一半了，最难的那段已经过去了';
  if (streak > 0) return '节奏刚好';
  if (progress > 0) return '开始了，就已经赢了没开始的时候';
  return '差一点点，一次打卡就回来';
}

// 获取最后一次打卡日期
function getLastCheckinDate(goal) {
  var checkins = goal.checkins || [];
  if (checkins.length === 0) return null;
  var sorted = checkins.slice().sort(function(a, b) {
    return (b.date || '').localeCompare(a.date || '');
  });
  return sorted[0].date;
}

// 历史最长streak
function calcMaxStreak(checkins) {
  if (!checkins || checkins.length === 0) return 0;
  var daySet = {};
  checkins.forEach(function(c) { if (c.date) daySet[c.date] = true; });
  var dates = Object.keys(daySet).sort();
  var maxStreak = 1;
  var currentStreak = 1;
  for (var i = 1; i < dates.length; i++) {
    var prev = new Date(dates[i - 1]);
    var curr = new Date(dates[i]);
    var diff = Math.round((curr - prev) / 86400000);
    if (diff === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

// ---- 快捷按钮计算 ----
function calcQuickButtons(goal) {
  if (goal.type === 'habit') return [1]; // 习惯型：只有+1
  if (goal.type === 'milestone') return []; // 里程碑：无按钮
  if (goal.type === 'value') return []; // 数值型：无按钮

  // 累计型
  // 如果用户自定义了快捷按钮，使用自定义值
  if (goal.quickButtons && goal.quickButtons.length === 3) {
    return goal.quickButtons;
  }

  // 存钱类：按每月定额÷30的0.5/1/2倍取整
  if (goal.monthlyDeposit && goal.monthlyDeposit > 0) {
    var dailyBase = goal.monthlyDeposit / 30;
    return [
      Math.max(1, Math.round(dailyBase * 0.5)),
      Math.max(1, Math.round(dailyBase * 1)),
      Math.max(1, Math.round(dailyBase * 2)),
    ];
  }

  var dailyNeed = calcDailyNeed(goal);
  if (dailyNeed <= 0) return [1, 5, 10];

  var raw = [dailyNeed * 0.5, dailyNeed * 1, dailyNeed * 2];
  var rounded = raw.map(function(v) { return roundToNice(v); });
  return rounded;
}

// 取整为好看数字（1/2.5/5 × 10的n次方）
function roundToNice(val) {
  if (val <= 0) return 1;
  if (val < 1) return 1;
  var exponent = Math.floor(Math.log10(val));
  var base = val / Math.pow(10, exponent);
  var niceBase;
  // 1/2.5/5 序列，分界点取相邻好数字的中点
  if (base < 1.75) niceBase = 1;       // [1, 1.75) → 1
  else if (base < 3.75) niceBase = 2.5; // [1.75, 3.75) → 2.5
  else if (base < 7.5) niceBase = 5;    // [3.75, 7.5) → 5
  else niceBase = 10;                    // [7.5, 10) → 10
  var result = niceBase * Math.pow(10, exponent);
  // 2.5×10^0 = 2.5 不是整数，需要根据原值决定取 2 还是 3
  if (result === 2.5) {
    return val < 2.25 ? 2 : 3;
  }
  return Math.round(result);
}

// 计算每日需求量
function calcDailyNeed(goal) {
  if (goal.type === 'habit') return 1;
  if (goal.type === 'milestone') return 0;
  if (goal.type === 'value') return 0;

  var remaining = (goal.target || 0) - (goal.currentValue || 0);
  if (remaining <= 0) return 0;

  if (goal.deadline) {
    var remainingDays = daysBetween(new Date(), goal.deadline);
    if (remainingDays <= 0) return remaining;
    return remaining / remainingDays;
  } else {
    // 无截止日期：目标值的1%/2%/5%
    return (goal.target || 100) * 0.01;
  }
}

// ---- 渲染目标列表 ----
function renderGoals() {
  var allGoals = loadGoals();
  var goals = allGoals.filter(function(g) { return !g.completed; });
  var completed = allGoals.filter(function(g) { return g.completed; });
  var listEl = document.getElementById('goal-list');
  var hallEl = document.getElementById('goal-hall');
  var hallList = document.getElementById('hall-list');

  listEl.innerHTML = '';
  if (goals.length === 0) {
    listEl.innerHTML = emptyStateHTML('goal', '还没有目标。点击下方加号，写下第一个目标。大目标不知道怎么拆？试试「帮我拆解」。', '', '');
  } else {
    goals.forEach(function(g) {
      var progress = calcProgress(g);
      var streak = calcStreak(g.checkins || []);
      var comment = humanComment(g);
      var isStale = !g.paused && getLastCheckinDate(g) && daysBetween(getLastCheckinDate(g), todayKey()) >= 3;
      var isPaused = !!g.paused;

      // 暂停标记
      var pauseBadge = isPaused ? '<span class="goal-pause-badge">在休息</span>' : '';
      // 待同步标记
      var syncDot = (window.syncAdapter && syncAdapter.hasPendingForGoal(g.id)) ? '<span class="sync-pending-dot" title="待同步"></span>' : '';

      // 久未打卡视觉降饱和
      var cardClass = 'goal-card';
      if (isStale) cardClass += ' goal-card--stale';
      if (isPaused) cardClass += ' goal-card--paused';

      var card = document.createElement('div');
      card.className = cardClass;
      card.dataset.id = g.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      if (g.type === 'composite') {
        // ---- 复合目标卡片 ----
        card.classList.add('goal-card--composite');
        var subListHTML = '';
        if (g.children && g.children.length > 0) {
          subListHTML = '<div class="composite-subgoal-list">';
          g.children.forEach(function(c) {
            var cProg = calcProgress(c);
            var cPct = Math.round(cProg * 100);
            var todayChecked = (c.checkins || []).some(function(ci) { return ci.date === todayKey(); });
            var statusHTML = c.completed
              ? '<span class="composite-subgoal-row__status composite-subgoal-row__status--done">✓</span>'
              : (todayChecked ? '<span class="composite-subgoal-row__status composite-subgoal-row__status--done">今日✓</span>' : '<span class="composite-subgoal-row__status"></span>');
            subListHTML += '<div class="composite-subgoal-row" data-subgoal-id="' + c.id + '">' +
              '<span class="composite-subgoal-row__name">' + escapeHtml(c.name) + '</span>' +
              '<div class="composite-subgoal-row__bar"><div class="composite-subgoal-row__fill" style="width:' + cPct + '%"></div></div>' +
              '<span class="composite-subgoal-row__pct">' + cPct + '%</span>' +
              statusHTML +
            '</div>';
          });
          subListHTML += '</div>';
        } else {
          subListHTML = '<p class="composite-empty-hint">把它拆小，每一块就都有了进度</p>';
        }

        card.innerHTML =
          '<div class="composite-northstar">' +
            '<div class="composite-northstar__name"><span class="composite-northstar__star">⭐</span>' + escapeHtml(g.name) + ' ' + pauseBadge + syncDot + '</div>' +
            '<div class="composite-northstar__hint">这是方向，不是进度条——看下面的</div>' +
          '</div>' +
          subListHTML +
          '<div class="goal-card__meta" style="margin-top:var(--s-3)">' +
            (streak > 0 ? '<span class="streak-badge">🔥' + streak + '</span>' : '') +
            '<span style="font-size:11px;color:var(--t-3);margin-left:auto">总进度 ' + Math.round(progress * 100) + '%</span>' +
          '</div>';

        // 子目标点击直达
        card.addEventListener('click', function(e) {
          var subRow = e.target.closest('.composite-subgoal-row');
          if (subRow) {
            e.stopPropagation();
            openSubGoalDetail(g.id, subRow.dataset.subgoalId);
            return;
          }
          openGoalDetail(g.id);
        });
      } else {
        // ---- 普通目标卡片（原有逻辑）----
        // 快捷打卡按钮
        var quickBtns = calcQuickButtons(g);
        var quickBtnHTML = '';
        if (quickBtns.length > 0 && !g.paused && !g.completed) {
          quickBtnHTML = '<div class="goal-card__quick">';
          quickBtns.forEach(function(amt) {
            var display = (g.type === 'habit') ? '+1次' : '+' + amt;
            quickBtnHTML += '<button class="goal-quick-btn" data-quick-amount="' + amt + '" data-goal-id="' + g.id + '" type="button">' + display + '</button>';
          });
          quickBtnHTML += '</div>';
        }

        card.innerHTML =
          ringSVG(progress) +
          '<div class="goal-card__body">' +
            '<div class="goal-card__name">' + escapeHtml(g.name) + ' ' + pauseBadge + syncDot + '</div>' +
            '<div class="goal-card__comment">' + escapeHtml(comment) + '</div>' +
            '<div class="goal-card__meta">' +
              (streak > 0 ? '<span class="streak-badge">🔥' + streak + '</span>' : '') +
            '</div>' +
            quickBtnHTML +
          '</div>';
        card.addEventListener('click', function(e) {
          if (e.target.closest('.goal-quick-btn')) return;
          openGoalDetail(g.id);
        });
      }

      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGoalDetail(g.id); }
      });
      listEl.appendChild(card);
    });

    // 绑定快捷打卡
    listEl.querySelectorAll('.goal-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var amt = parseFloat(btn.dataset.quickAmount) || 0;
        var gid = btn.dataset.goalId;
        quickCheckin(gid, amt, btn);
      });
    });
  }

  // 完成殿堂 — 保留"为什么"
  if (completed.length > 0) {
    hallEl.hidden = false;
    hallList.innerHTML = completed
      .sort(function(a,b) { return new Date(b.completedDate) - new Date(a.completedDate); })
      .map(function(g) {
        var totalCheckins = (g.checkins || []).length;
        var usedDays = g.completedDate ? daysBetween(g.createdDate || g.completedDate, g.completedDate) : 0;
        return '<div class="hall__item">' +
          '<span class="hall__trophy">🏆</span>' +
          '<div class="hall__info">' +
            '<span class="hall__name">' + escapeHtml(g.name) + '</span>' +
            (g.why ? '<span class="hall__why">「' + escapeHtml(g.why) + '」</span>' : '') +
            '<span class="hall__meta">完成于 ' + (g.completedDate ? formatDate(g.completedDate) : '') + ' · 打卡 ' + totalCheckins + ' 次 · 用时 ' + usedDays + ' 天</span>' +
          '</div>' +
        '</div>';
      }).join('');
  } else {
    hallEl.hidden = true;
  }
}

// ---- 卡片快捷打卡（带环动画+鼓励语）----
function quickCheckin(goalId, amount, btnEl) {
  var goals = loadGoals();
  var g = goals.find(function(gg) { return gg.id === goalId; });
  if (!g || g.completed || g.paused) return;

  // 检查断卡回归
  var lastDate = getLastCheckinDate(g);
  var isReturn = lastDate && daysBetween(lastDate, todayKey()) >= 3;

  var now = new Date();
  var checkin = {
    date: todayKey(),
    time: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    amount: amount,
    note: '',
    tag: '',
  };
  if (!g.checkins) g.checkins = [];
  g.checkins.push(checkin);
  g.currentValue = (g.currentValue || 0) + amount;

  // 成就检测
  var achievements = checkAchievements(g);

  var justCompleted = false;
  if (g.type !== 'milestone' && g.target > 0 && g.currentValue >= g.target && !g.completed) {
    g.completed = true;
    g.completedDate = new Date().toISOString();
    addTimelineFromGoal(g);
    justCompleted = true;
  }
  saveGoals(goals);
  invalidateProbCache(goalId);

  // 环动画
  if (btnEl) {
    var card = btnEl.closest('.goal-card');
    if (card) {
      var ringFill = card.querySelector('.ring__fill');
      if (ringFill) {
        ringFill.classList.add('ring__fill--pulse');
        setTimeout(function() { ringFill.classList.remove('ring__fill--pulse'); }, 600);
      }
    }
  }

  renderGoals();

  // 弹鼓励语
  if (justCompleted) {
    showCompletionRitual(g);
  } else if (isReturn) {
    showToast('欢迎回来。中断是人之常情，回来就是本事', 'success', { duration: 4000 });
  } else if (achievements.length > 0) {
    showToast(achievements[0].text, 'success', { duration: 4000 });
  } else {
    showToast(randomEncourage(), 'success', {
      undo: function() {
        var gs2 = loadGoals();
        var g2 = gs2.find(function(x) { return x.id === goalId; });
        if (g2 && g2.checkins && g2.checkins.length > 0) {
          var last = g2.checkins[g2.checkins.length - 1];
          g2.currentValue = (g2.currentValue || 0) - (last.amount || 0);
          if (g2.currentValue < 0) g2.currentValue = 0;
          if (g2.completed && calcProgress(g2) < 1) {
            g2.completed = false;
            g2.completedDate = null;
          }
          g2.checkins.pop();
          saveGoals(gs2);
          invalidateProbCache(goalId);
          renderGoals();
        }
      }
    });
  }
}

// ---- 成就时刻检测 ----
function checkAchievements(goal) {
  var achievements = [];
  var checkins = goal.checkins || [];

  // 首次打卡
  if (checkins.length === 1) {
    achievements.push({ type: 'first', text: '第一步迈出去了。这就是开始的力量' });
  }

  // 连续7天
  var streak = calcStreak(checkins);
  if (streak === 7) {
    achievements.push({ type: 'streak7', text: '第一个7天。习惯正在长出来' });
  }

  // 首达50%
  var progress = calcProgress(goal);
  if (progress >= 0.5 && !goal._reached50) {
    goal._reached50 = true;
    achievements.push({ type: 'half', text: '过半了。回头看看起点，你已经走得很远' });
  }

  // 首个完成
  if (goal.completed && !goal._completedNotified) {
    goal._completedNotified = true;
    achievements.push({ type: 'complete', text: '你说过的，你做到了' });
  }

  return achievements;
}

// ---- 完成时刻仪式 ----
function showCompletionRitual(goal) {
  // 全屏撒花 + 目标名 + 为什么 + 你说过的你做到了
  launchConfetti();
  setTimeout(function() {
    launchConfetti();
  }, 500);

  var ritualHTML =
    '<div class="completion-ritual" id="completion-ritual">' +
      '<div class="completion-ritual__inner">' +
        '<div class="completion-ritual__icon">🏆</div>' +
        '<h2 class="completion-ritual__title">' + escapeHtml(goal.name) + '</h2>' +
        (goal.why ? '<p class="completion-ritual__why">「' + escapeHtml(goal.why) + '」</p>' : '') +
        '<p class="completion-ritual__text">你说过的，你做到了</p>' +
      '</div>' +
    '</div>';

  var div = document.createElement('div');
  div.innerHTML = ritualHTML;
  document.body.appendChild(div.firstElementChild);

  setTimeout(function() {
    var ritual = document.getElementById('completion-ritual');
    if (ritual) {
      ritual.classList.add('completion-ritual--fadeout');
      setTimeout(function() { if (ritual) ritual.remove(); }, 800);
    }
  }, 3000);

  showToast('恭喜！目标已完成 🎉', 'success', { duration: 4000 });
}

// ---- 目标模板库 ----
// ---- 模板：生成子目标对象的辅助函数 ----
function _mkChild(name, type, target, unit, weight, opts) {
  opts = opts || {};
  return {
    id: uuid(),
    name: name,
    type: type,
    target: target,
    startVal: opts.startVal || 0,
    unit: unit,
    currentValue: opts.startVal || 0,
    weight: weight || 1,
    weeklyTarget: opts.weeklyTarget || null,
    checkins: [],
    completed: false,
    completedDate: null,
    createdDate: new Date().toISOString(),
    deadline: null,
    fields: [],
    quickButtons: null,
    monthlyDeposit: opts.monthlyDeposit || null,
    paused: false,
    _reached50: false,
    _completedNotified: false,
    milestones: opts.milestones || null,
  };
}

// ---- 六大赛道模板库（复合目标 + 普通目标）----
var GOAL_TEMPLATE_CATEGORIES = [
  {
    name: '学业',
    templates: [
      {
        templateName: '考上名校',
        isComposite: true,
        name: '考上名校',
        why: '给自己一个更高的起点',
        children: function() {
          return [
            _mkChild('数学130分', 'value', 130, '分', 1, { startVal: 0 }),
            _mkChild('英语80分', 'value', 80, '分', 1, { startVal: 0 }),
            _mkChild('每天学3小时', 'habit', 100, '次', 1, { weeklyTarget: 7 }),
            _mkChild('四轮复习', 'milestone', 4, '轮', 1, { milestones: [{label:'一轮复习',done:false},{label:'二轮复习',done:false},{label:'真题训练',done:false},{label:'模拟考试',done:false}] }),
          ];
        }
      },
      {
        templateName: '考公上岸',
        isComposite: true,
        name: '考公上岸',
        why: '稳稳的也是一种力量',
        children: function() {
          return [
            _mkChild('行测75分', 'value', 75, '分', 1, { startVal: 0 }),
            _mkChild('申论70分', 'value', 70, '分', 1, { startVal: 0 }),
            _mkChild('每天刷题', 'cumulative', 5000, '题', 1),
          ];
        }
      },
    ]
  },
  {
    name: '财富',
    templates: [
      {
        templateName: '存下第一个10万',
        isComposite: true,
        name: '存下第一个10万',
        why: '手有余粮心不慌',
        children: function() {
          return [
            _mkChild('存款到10万', 'cumulative', 100000, '元', 1, { monthlyDeposit: 3000 }),
            _mkChild('每月存3000', 'habit', 100, '次', 1, { weeklyTarget: 1 }),
          ];
        }
      },
      {
        templateName: '应急基金',
        isComposite: true,
        name: '建好应急基金',
        why: '6个月生活费，给自己底气',
        children: function() {
          return [
            _mkChild('存够6个月生活费', 'cumulative', 30000, '元', 1, { monthlyDeposit: 2500 }),
          ];
        }
      },
    ]
  },
  {
    name: '身体',
    templates: [
      {
        templateName: '练出薄肌',
        isComposite: true,
        name: '练出薄肌',
        why: '更轻盈更有力地生活',
        children: function() {
          return [
            _mkChild('体重到65kg', 'value', 65, 'kg', 1, { startVal: 75 }),
            _mkChild('每周练3次', 'habit', 100, '次', 1, { weeklyTarget: 3 }),
            _mkChild('蛋白质摄入累计', 'cumulative', 10000, 'g', 1),
          ];
        }
      },
      {
        templateName: '跑完半马',
        isComposite: true,
        name: '跑完半马',
        why: '21.0975km，跑完就是自己的英雄',
        children: function() {
          return [
            _mkChild('跑量累计', 'cumulative', 300, 'km', 1),
            _mkChild('每周跑3次', 'habit', 100, '次', 1, { weeklyTarget: 3 }),
          ];
        }
      },
    ]
  },
  {
    name: '技能',
    templates: [
      {
        templateName: '转行程序员',
        isComposite: true,
        name: '转行程序员',
        why: '换个赛道，换种活法',
        children: function() {
          return [
            _mkChild('课程进度', 'milestone', 4, '轮', 1, { milestones: [{label:'基础语法',done:false},{label:'框架实战',done:false},{label:'项目落地',done:false},{label:'面试准备',done:false}] }),
            _mkChild('每天coding 1小时', 'habit', 100, '次', 1, { weeklyTarget: 7 }),
            _mkChild('项目作品数', 'cumulative', 3, '个', 1),
          ];
        }
      },
      {
        templateName: '雅思7分',
        isComposite: true,
        name: '雅思7分',
        why: '世界再大也去得',
        children: function() {
          return [
            _mkChild('单词累计', 'cumulative', 6000, '词', 1),
            _mkChild('每周模考分数', 'value', 7, '分', 1, { startVal: 5 }),
            _mkChild('每天精听', 'habit', 100, '次', 1, { weeklyTarget: 7 }),
          ];
        }
      },
    ]
  },
  {
    name: '创作',
    templates: [
      {
        templateName: '写完一本书',
        isComposite: true,
        name: '写完一本书',
        why: '把脑子里的东西变成白纸黑字',
        children: function() {
          return [
            _mkChild('字数累计', 'cumulative', 80000, '字', 1),
            _mkChild('每天写500字', 'habit', 100, '次', 1, { weeklyTarget: 7 }),
          ];
        }
      },
      {
        templateName: '做100条视频',
        isComposite: true,
        name: '做100条视频',
        why: '持续输出是最好的输入',
        children: function() {
          return [
            _mkChild('发布数累计', 'cumulative', 100, '条', 1),
            _mkChild('每周2更', 'habit', 100, '次', 1, { weeklyTarget: 2 }),
          ];
        }
      },
    ]
  },
  {
    name: '习惯养成',
    templates: [
      {
        templateName: '早睡早起',
        isComposite: true,
        name: '早睡早起',
        why: '掌控早晨的人掌控一天',
        children: function() {
          return [
            _mkChild('起床时间到6:30', 'value', 6.5, '点', 1, { startVal: 8 }),
            _mkChild('每周达标6天', 'habit', 100, '次', 1, { weeklyTarget: 6 }),
          ];
        }
      },
      {
        templateName: '戒短视频',
        isComposite: true,
        name: '戒短视频',
        why: '把注意力拿回来',
        children: function() {
          return [
            _mkChild('戒断天数', 'cumulative', 90, '天', 1),
            _mkChild('每天阅读替代', 'habit', 100, '次', 1, { weeklyTarget: 7 }),
          ];
        }
      },
    ]
  },
];

function getMyTemplates() {
  return loadJSON(STORAGE_MY_TEMPLATES, []);
}

function saveMyTemplate(tpl) {
  var list = getMyTemplates();
  list.push(tpl);
  saveJSON(STORAGE_MY_TEMPLATES, list);
}

function deleteMyTemplate(idx) {
  var list = getMyTemplates();
  if (idx >= 0 && idx < list.length) {
    list.splice(idx, 1);
    saveJSON(STORAGE_MY_TEMPLATES, list);
  }
}

function applyTemplateToForm(tpl) {
  var form = document.getElementById('goal-form');
  form.querySelector('[name="name"]').value = tpl.name || '';
  form.querySelector('[name="why"]').value = tpl.why || '';
  form.querySelector('[name="type"]').value = tpl.type || 'cumulative';
  form.querySelector('[name="target"]').value = tpl.target || '';
  form.querySelector('[name="unit"]').value = tpl.unit || '';
  if (tpl.type === 'habit' && tpl.weeklyTarget) {
    var wt = form.querySelector('[name="weeklyTarget"]');
    if (wt) wt.value = tpl.weeklyTarget;
  }
  if (tpl.type === 'milestone' && tpl.milestones) {
    var ms = form.querySelector('[name="milestones"]');
    if (ms) ms.value = tpl.milestones.map(function(m) { return m.label; }).join('\n');
  }
  adaptGoalFormByType(tpl.type || 'cumulative');
  if (tpl.fields && tpl.fields.length) {
    setGoalFieldsForForm(tpl.fields.map(function(f) {
      return { id: uuid(), type: f.type, name: f.name, unit: f.unit || undefined, options: f.options ? f.options.slice() : undefined };
    }));
  } else {
    setGoalFieldsForForm([]);
  }
  updateQuickButtonPreview();
}

function openTemplateModal() {
  var modal = document.getElementById('confirm-modal');
  var titleEl = document.getElementById('confirm-title');
  var descEl = document.getElementById('confirm-desc');
  var actionsEl = modal.querySelector('.confirm-modal__actions');

  titleEl.textContent = '目标模板';
  var myTemplates = getMyTemplates();
  var html = '';

  // 我的模板分组
  if (myTemplates.length > 0) {
    html += '<p class="template-category-title">我的</p>';
    html += '<div class="template-list">';
    myTemplates.forEach(function(t, i) {
      var desc = t.isComposite ? '复合目标' : (t.type === 'milestone' ? '里程碑型' : (t.type === 'habit' ? '习惯型' : (t.type === 'value' ? '数值型' : '累计型')));
      html += '<div class="template-item-wrap">' +
        '<button class="template-item" data-mytpl="' + i + '" type="button">' +
          '<span class="template-item__name">' + escapeHtml(t.templateName) + '</span>' +
          '<span class="template-item__desc">' + escapeHtml(desc) + '</span>' +
        '</button>' +
        '<button class="template-item__del" data-mytpl-del="' + i + '" type="button" title="删除模板">×</button>' +
      '</div>';
    });
    html += '</div>';
  }

  // 六大赛道分组
  GOAL_TEMPLATE_CATEGORIES.forEach(function(cat, ci) {
    html += '<p class="template-category-title">' + escapeHtml(cat.name) + '</p>';
    html += '<div class="template-list">';
    cat.templates.forEach(function(t, ti) {
      var desc = t.isComposite ? '复合目标 · ' + (t.children ? t.children().length : 0) + '个子目标' : '普通目标';
      html += '<button class="template-item" data-cat="' + ci + '" data-tpl="' + ti + '" type="button">' +
        '<span class="template-item__name">' + escapeHtml(t.templateName) + '</span>' +
        '<span class="template-item__desc">' + escapeHtml(desc) + '</span>' +
      '</button>';
    });
    html += '</div>';
  });

  descEl.innerHTML = html;
  actionsEl.innerHTML = '<button type="button" class="btn btn--ghost" id="template-cancel">取消</button>';
  modal.hidden = false;

  // 预设模板点击
  modal.querySelectorAll('[data-cat]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ci = parseInt(btn.dataset.cat);
      var ti = parseInt(btn.dataset.tpl);
      var cat = GOAL_TEMPLATE_CATEGORIES[ci];
      if (!cat || !cat.templates[ti]) return;
      var tpl = cat.templates[ti];

      if (tpl.isComposite) {
        // 复合目标模板 → 直接创建
        closeAnyModal(modal);
        restoreConfirmActions();
        createGoalFromCompositeTemplate(tpl);
      } else {
        closeAnyModal(modal);
        restoreConfirmActions();
        openGoalModal(null);
        applyTemplateToForm(tpl);
      }
    });
  });

  // 我的模板点击
  modal.querySelectorAll('[data-mytpl]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.mytpl);
      var myTpls = getMyTemplates();
      var tpl = myTpls[idx];
      if (!tpl) return;
      closeAnyModal(modal);
      restoreConfirmActions();
      if (tpl.isComposite) {
        createGoalFromCompositeTemplate(tpl);
      } else {
        openGoalModal(null);
        applyTemplateToForm(tpl);
      }
    });
  });

  // 我的模板删除
  modal.querySelectorAll('[data-mytpl-del]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var idx = parseInt(btn.dataset.mytplDel);
      deleteMyTemplate(idx);
      showToast('模板已删除', 'success');
      openTemplateModal();
    });
  });

  document.getElementById('template-cancel').addEventListener('click', function() {
    closeAnyModal(modal);
    restoreConfirmActions();
  });
}

// 从复合模板创建目标
function createGoalFromCompositeTemplate(tpl) {
  var children;
  if (typeof tpl.children === 'function') {
    children = tpl.children();
  } else if (Array.isArray(tpl.children)) {
    children = JSON.parse(JSON.stringify(tpl.children));
    children.forEach(function(c) { c.id = uuid(); });
  } else {
    children = [];
  }

  var goal = {
    id: uuid(),
    name: tpl.name || tpl.templateName,
    why: tpl.why || '',
    type: 'composite',
    children: children,
    completed: false,
    completedDate: null,
    createdDate: new Date().toISOString(),
    paused: false,
    deadline: null,
    checkins: [],
  };

  var goals = loadGoals();
  goals.push(goal);
  saveGoals(goals);
  renderGoals();
  showToast('已从模板创建「' + goal.name + '」', 'success');

  // 首次创建复合目标 → coach marks
  var coachShown = localStorage.getItem(STORAGE_COACH_SHOWN);
  if (!coachShown) {
    setTimeout(function() { showCoachMarks(); }, 400);
  }
}

function saveCurrentAsTemplate() {
  var form = document.getElementById('goal-form');
  var name = form.querySelector('[name="name"]').value.trim();
  if (!name) {
    showToast('请先填写目标名称', 'warning');
    return;
  }
  var type = form.querySelector('[name="type"]').value;
  var target = form.querySelector('[name="target"]').value;
  var unit = form.querySelector('[name="unit"]').value;
  var why = form.querySelector('[name="why"]').value;
  var weeklyTarget = form.querySelector('[name="weeklyTarget"]') ? form.querySelector('[name="weeklyTarget"]').value : null;
  var milestonesStr = form.querySelector('[name="milestones"]') ? form.querySelector('[name="milestones"]').value : '';

  var milestones = null;
  if (type === 'milestone' && milestonesStr) {
    milestones = milestonesStr.split('\n').map(function(s) {
      return { label: s.trim(), done: false };
    }).filter(function(m) { return m.label; });
  }

  var fieldsCopy = _goalFields.map(function(f) {
    var copy = { id: uuid(), type: f.type, name: f.name };
    if (f.unit) copy.unit = f.unit;
    if (f.options) copy.options = f.options.slice();
    return copy;
  });

  var tpl = {
    templateName: name,
    name: name,
    type: type,
    target: target ? parseFloat(target) : null,
    unit: unit,
    why: why,
    weeklyTarget: weeklyTarget ? parseInt(weeklyTarget) : null,
    milestones: milestones,
    fields: fieldsCopy.length ? fieldsCopy : null
  };

  saveMyTemplate(tpl);
  showToast('已存为模板「' + name + '」', 'success');
}

// ---- 打卡字段配置管理 ----
var _goalFields = []; // 临时存储表单中的字段配置

// 简易 SVG 折线图
function renderMiniSparkline(values) {
  if (!values || values.length < 2) return '';
  var w = 200, h = 30, pad = 2;
  var vals = values.map(function(v) { return v.val; });
  var min = Math.min.apply(null, vals);
  var max = Math.max.apply(null, vals);
  if (max === min) max = min + 1;
  var pts = values.map(function(v, i) {
    var x = pad + (i / (values.length - 1)) * (w - pad * 2);
    var y = h - pad - ((v.val - min) / (max - min)) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:30px"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--c-accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function renderFieldsConfigList() {
  var listEl = document.getElementById('fields-config-list');
  if (!listEl) return;
  if (_goalFields.length === 0) {
    listEl.innerHTML = '<span style="font-size:11px;color:var(--t-3)">添加后，打卡时会多出对应输入项（全部选填）</span>';
    return;
  }
  var html = '';
  _goalFields.forEach(function(f, i) {
    var typeLabel = f.type === 'number' ? '数字' : (f.type === 'choice' ? '单选' : '一句话');
    html += '<div class="fields-config-item" data-field-idx="' + i + '">';
    html +=   '<span class="fields-config-item__type">' + typeLabel + '</span>';
    html +=   '<input type="text" class="fields-config-item__name" placeholder="字段名（如：时长）" value="' + escapeHtml(f.name || '') + '" data-field-prop="name">';
    if (f.type === 'number') {
      html += '<input type="text" class="fields-config-item__unit" placeholder="单位" value="' + escapeHtml(f.unit || '') + '" data-field-prop="unit">';
    } else if (f.type === 'choice') {
      html += '<input type="text" class="fields-config-item__options" placeholder="选项，逗号分隔（如：胸,背,腿）" value="' + escapeHtml((f.options || []).join(',')) + '" data-field-prop="options">';
    }
    html +=   '<button type="button" class="fields-config-item__del" data-field-del="' + i + '">×</button>';
    html += '</div>';
  });
  listEl.innerHTML = html;

  // 绑定输入事件
  listEl.querySelectorAll('.fields-config-item').forEach(function(item) {
    var idx = parseInt(item.dataset.fieldIdx);
    item.querySelectorAll('[data-field-prop]').forEach(function(input) {
      input.addEventListener('input', function() {
        var prop = input.dataset.fieldProp;
        if (prop === 'options') {
          _goalFields[idx].options = input.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        } else {
          _goalFields[idx][prop] = input.value.trim();
        }
      });
    });
  });
  listEl.querySelectorAll('.fields-config-item__del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.fieldDel);
      _goalFields.splice(idx, 1);
      renderFieldsConfigList();
    });
  });
}

function addGoalField(type) {
  var field = { id: uuid(), type: type, name: '' };
  if (type === 'number') field.unit = '';
  if (type === 'choice') field.options = [];
  _goalFields.push(field);
  renderFieldsConfigList();
}

function getGoalFieldsFromForm() {
  return _goalFields.filter(function(f) { return f.name && f.name.length > 0; });
}

function setGoalFieldsForForm(fields) {
  _goalFields = fields ? JSON.parse(JSON.stringify(fields)) : [];
  renderFieldsConfigList();
}

// ---- 快捷按钮预览更新 ----
function updateQuickButtonPreview() {
  var form = document.getElementById('goal-form');
  if (!form) return;
  var type = form.querySelector('[name="type"]').value;
  var target = parseFloat(form.querySelector('[name="target"]').value) || 100;
  var deadline = form.querySelector('[name="deadline"]').value;
  var currentValue = 0;

  var previewGoal = {
    type: type,
    target: target,
    currentValue: currentValue,
    deadline: deadline,
  };

  var btns = calcQuickButtons(previewGoal);
  var previewEl = document.getElementById('quick-btn-preview');
  if (previewEl) {
    if (btns.length === 0) {
      previewEl.textContent = type === 'habit' ? '快捷按钮：+1次' : (type === 'value' ? '录入当前值' : '无快捷按钮');
    } else {
      previewEl.textContent = '快捷按钮：' + btns.map(function(b) { return '+' + b; }).join(' / ') + '（自动估算，点这里可改）';
    }
  }

  // 更新自定义输入区
  var customArea = document.getElementById('quick-btn-custom');
  if (customArea) {
    var inputs = customArea.querySelectorAll('input');
    if (inputs.length >= 3 && btns.length === 3) {
      inputs[0].value = btns[0];
      inputs[1].value = btns[1];
      inputs[2].value = btns[2];
    }
  }
}

// ============================================================
// 目标 — 添加/编辑弹窗（类型自适应 + 编辑回填）
// ============================================================

function validateForm(form) {
  var valid = true;
  form.querySelectorAll('[required]').forEach(function(input) {
    var field = input.closest('.field');
    var errorEl = field ? field.querySelector('.field__error') : null;
    if (!input.value.trim()) {
      valid = false;
      input.classList.add('is-invalid');
      if (errorEl) {
        errorEl.textContent = '此项必填';
        errorEl.classList.add('is-visible');
      }
    } else {
      input.classList.remove('is-invalid');
      if (errorEl) {
        errorEl.classList.remove('is-visible');
      }
    }
  });
  return valid;
}

// 根据类型显隐字段并改写标签
function adaptGoalFormByType(type) {
  var milestoneEditor = document.getElementById('milestone-editor');
  var fieldTargetRow = document.getElementById('field-target-row');
  var fieldStart = document.getElementById('field-start');
  var fieldWeekly = document.getElementById('field-weekly');
  var fieldUnit = document.getElementById('field-unit');
  var fieldMonthlyDeposit = document.getElementById('field-monthly-deposit');
  var lblTarget = document.getElementById('lbl-target');

  milestoneEditor.hidden = type !== 'milestone';

  // 每月定额只对累计型显示
  if (fieldMonthlyDeposit) {
    fieldMonthlyDeposit.hidden = type !== 'cumulative';
  }

  // 「与同行者一起做」只对累计型/习惯型 + 已连接同行者时显示
  updateSharedGoalCheckboxVisibility(type);

  if (type === 'milestone') {
    fieldTargetRow.style.display = 'none';
    fieldWeekly.hidden = true;
    fieldUnit.hidden = true;
  } else if (type === 'habit') {
    fieldTargetRow.style.display = '';
    fieldStart.style.display = 'none';
    fieldWeekly.hidden = false;
    fieldUnit.hidden = false;
    lblTarget.textContent = '目标总次数';
  } else if (type === 'value') {
    fieldTargetRow.style.display = '';
    fieldStart.style.display = '';
    fieldWeekly.hidden = true;
    fieldUnit.hidden = false;
    lblTarget.textContent = '目标值（最终值）';
  } else {
    // cumulative
    fieldTargetRow.style.display = '';
    fieldStart.style.display = 'none';
    fieldWeekly.hidden = true;
    fieldUnit.hidden = false;
    lblTarget.textContent = '目标值';
  }
}

function openGoalModal(editId) {
  var modal = document.getElementById('goal-modal');
  var form = document.getElementById('goal-form');
  var titleEl = document.getElementById('goal-modal-title');
  var submitBtn = document.getElementById('goal-submit-btn');
  var editIdEl = document.getElementById('goal-edit-id');

  form.reset();

  if (editId) {
    // 编辑模式
    var goals = loadGoals();
    var goal = goals.find(function(g) { return g.id === editId; });
    if (!goal) return;
    titleEl.textContent = '编辑目标';
    submitBtn.textContent = '保存';
    editIdEl.value = editId;
    form.querySelector('[name="name"]').value = goal.name || '';
    form.querySelector('[name="why"]').value = goal.why || '';
    form.querySelector('[name="type"]').value = goal.type;
    form.querySelector('[name="target"]').value = goal.target || 100;
    form.querySelector('[name="startVal"]').value = goal.startVal || 0;
    form.querySelector('[name="unit"]').value = goal.unit || '个';
    form.querySelector('[name="deadline"]').value = goal.deadline || '';
    form.querySelector('[name="weeklyTarget"]').value = goal.weeklyTarget || 3;
    if (goal.type === 'milestone' && goal.milestones) {
      form.querySelector('[name="milestones"]').value = goal.milestones.map(function(m) { return m.label; }).join('\n');
    }
    // 回填自定义快捷按钮
    if (goal.quickButtons && goal.quickButtons.length === 3) {
      var inputs = form.querySelectorAll('.quick-btn-custom-input');
      if (inputs.length >= 3) {
        inputs[0].value = goal.quickButtons[0];
        inputs[1].value = goal.quickButtons[1];
        inputs[2].value = goal.quickButtons[2];
      }
    }
    // 回填打卡字段
    setGoalFieldsForForm(goal.fields || []);
    // 回填每月定额
    var mdInput = form.querySelector('[name="monthlyDeposit"]');
    if (mdInput) mdInput.value = goal.monthlyDeposit || '';
    adaptGoalFormByType(goal.type);
  } else {
    // 新建模式
    titleEl.textContent = '新建目标';
    submitBtn.textContent = '创建';
    editIdEl.value = '';
    form.querySelector('[name="target"]').value = 100;
    form.querySelector('[name="startVal"]').value = 0;
    form.querySelector('[name="unit"]').value = '个';
    form.querySelector('[name="weeklyTarget"]').value = 3;
    var mdInputNew = form.querySelector('[name="monthlyDeposit"]');
    if (mdInputNew) mdInputNew.value = '';
    var sharedCb = document.getElementById('goal-shared-checkbox');
    if (sharedCb) sharedCb.checked = false;
    setGoalFieldsForForm([]);
    adaptGoalFormByType('cumulative');
  }

  updateQuickButtonPreview();
  modal.hidden = false;
  trapFocus(modal);
}

// ============================================================
// 概念教学系统 — 教学条 + Coach Marks
// ============================================================

function initGoalTeaching() {
  var bar = document.getElementById('goal-teaching-bar');
  var closeBtn = document.getElementById('teaching-bar-close');
  if (!bar || !closeBtn) return;

  // 检查是否已关闭
  var dismissed = localStorage.getItem(STORAGE_GOAL_TEACHING);
  if (!dismissed) {
    bar.hidden = false;
  }

  closeBtn.addEventListener('click', function() {
    bar.hidden = true;
    localStorage.setItem(STORAGE_GOAL_TEACHING, '1');
  });
}

// 重新显示教学条（供设置调用）
function resetGoalTeaching() {
  localStorage.removeItem(STORAGE_GOAL_TEACHING);
  var bar = document.getElementById('goal-teaching-bar');
  if (bar) bar.hidden = false;
  showToast('教学提示已重开', 'success');
}

// ---- Coach marks ----
var coachSteps = [
  { selector: '.composite-northstar', text: '这是你的结果——大方向写在这里' },
  { selector: '.composite-subgoal-list', text: '这些是子目标——每一块都有自己的进度条' },
  { selector: '.composite-subgoal-row', text: '点这里直接打卡，不用进详情页' },
];

function showCoachMarks() {
  var overlay = document.getElementById('coach-overlay');
  var bubble = document.getElementById('coach-bubble');
  var textEl = document.getElementById('coach-text');
  var stepLabel = document.getElementById('coach-step-label');
  var nextBtn = document.getElementById('coach-next-btn');
  if (!overlay) return;

  var stepIdx = 0;

  function showStep() {
    var step = coachSteps[stepIdx];
    var target = document.querySelector(step.selector);
    textEl.textContent = step.text;
    stepLabel.textContent = (stepIdx + 1) + ' / ' + coachSteps.length;

    if (target) {
      var rect = target.getBoundingClientRect();
      bubble.style.left = (rect.left + rect.width / 2 - 140) + 'px';
      bubble.style.top = (rect.bottom + 12) + 'px';
      // 防止溢出
      var bubbleRect = bubble.getBoundingClientRect();
      if (parseInt(bubble.style.left) < 10) bubble.style.left = '10px';
      if (parseInt(bubble.style.left) + bubbleRect.width > window.innerWidth - 10) {
        bubble.style.left = (window.innerWidth - bubbleRect.width - 10) + 'px';
      }
      if (parseInt(bubble.style.top) + bubbleRect.height > window.innerHeight - 10) {
        bubble.style.top = (rect.top - bubbleRect.height - 12) + 'px';
      }
    } else {
      bubble.style.left = '50%';
      bubble.style.top = '50%';
      bubble.style.transform = 'translate(-50%, -50%)';
    }

    nextBtn.textContent = stepIdx === coachSteps.length - 1 ? '开始用' : '知道了';
  }

  overlay.hidden = false;
  showStep();

  nextBtn.onclick = function() {
    stepIdx++;
    if (stepIdx >= coachSteps.length) {
      overlay.hidden = true;
      localStorage.setItem(STORAGE_COACH_SHOWN, '1');
    } else {
      showStep();
    }
  };
}

// ============================================================
// 通用拆解向导
// ============================================================

function initDecomposeWizard() {
  var modal = document.getElementById('decompose-modal');
  if (!modal) return;

  var currentStep = 1;
  var nextBtn = document.getElementById('decompose-next');
  var backBtn = document.getElementById('decompose-back');
  var cancelBtn = document.getElementById('decompose-cancel');

  // 关闭
  modal.querySelectorAll('[data-close-decompose]').forEach(function(el) {
    el.addEventListener('click', function() { closeDecomposeWizard(); });
  });

  // 示例词点击 → 填入对应输入框
  modal.querySelectorAll('.decompose-example-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var fillText = chip.dataset.fill;
      if (currentStep === 1) {
        var input = document.getElementById('decompose-result');
        input.value = fillText;
      } else if (currentStep === 2) {
        var inputs = modal.querySelectorAll('.decompose-milestone-input');
        for (var i = 0; i < inputs.length; i++) {
          if (!inputs[i].value.trim()) {
            inputs[i].value = fillText;
            break;
          }
        }
      } else if (currentStep === 3) {
        var actionInputs = modal.querySelectorAll('.decompose-action-input');
        for (var j = 0; j < actionInputs.length; j++) {
          if (!actionInputs[j].value.trim()) {
            actionInputs[j].value = fillText;
            break;
          }
        }
      }
    });
  });

  function showStep(step) {
    currentStep = step;
    modal.querySelectorAll('.decompose-step').forEach(function(el) {
      el.hidden = el.dataset.decomposeStep != step;
      if (!el.hidden) el.classList.add('decompose-step--active');
      else el.classList.remove('decompose-step--active');
    });
    modal.querySelectorAll('.decompose-step-dot').forEach(function(dot) {
      dot.classList.toggle('decompose-step-dot--active', dot.dataset.stepDot == step);
    });

    backBtn.hidden = step === 1;
    nextBtn.textContent = step === 3 ? '完成拆解' : '下一步';
  }

  nextBtn.addEventListener('click', function() {
    if (currentStep < 3) {
      showStep(currentStep + 1);
    } else {
      // 完成拆解
      applyDecomposition();
    }
  });

  backBtn.addEventListener('click', function() {
    if (currentStep > 1) showStep(currentStep - 1);
  });

  function closeDecomposeWizard() {
    modal.hidden = true;
    // 重置
    document.getElementById('decompose-result').value = '';
    modal.querySelectorAll('.decompose-milestone-input').forEach(function(i) { i.value = ''; });
    modal.querySelectorAll('.decompose-action-input').forEach(function(i) { i.value = ''; });
    showStep(1);
  }

  // 暴露给外部调用
  window._closeDecomposeWizard = closeDecomposeWizard;
  window._showDecomposeStep = showStep;
}

function openDecomposeWizard() {
  var modal = document.getElementById('decompose-modal');
  if (!modal) return;
  // 重置
  document.getElementById('decompose-result').value = '';
  modal.querySelectorAll('.decompose-milestone-input').forEach(function(i) { i.value = ''; });
  modal.querySelectorAll('.decompose-action-input').forEach(function(i) { i.value = ''; });
  if (window._showDecomposeStep) window._showDecomposeStep(1);
  modal.hidden = false;
  trapFocus(modal);
}

function applyDecomposition() {
  var modal = document.getElementById('decompose-modal');

  // 收集数据
  var resultName = document.getElementById('decompose-result').value.trim();
  var milestoneInputs = modal.querySelectorAll('.decompose-milestone-input');
  var actionInputs = modal.querySelectorAll('.decompose-action-input');

  // 第1步不能跳过（结果名是北极星）
  if (!resultName) {
    showToast('先填一个你想要的结果吧', 'warning');
    return;
  }

  var milestones = [];
  milestoneInputs.forEach(function(input) {
    var v = input.value.trim();
    if (v) milestones.push(v);
  });

  var actions = [];
  actionInputs.forEach(function(input) {
    var v = input.value.trim();
    if (v) actions.push(v);
  });

  // 至少要有一步有内容
  if (milestones.length === 0 && actions.length === 0) {
    showToast('至少填一个关卡或一个行为', 'warning');
    return;
  }

  // 生成复合目标
  var children = [];
  var weight = 1; // 权重均分

  // 第2步：数值型子目标
  milestones.forEach(function(label) {
    children.push({
      id: uuid(),
      name: label,
      type: 'value',
      target: 100,
      startVal: 0,
      unit: '',
      currentValue: 0,
      weight: weight,
      checkins: [],
      completed: false,
      completedDate: null,
      createdDate: new Date().toISOString(),
      weeklyTarget: null,
      deadline: null,
      fields: [],
      quickButtons: null,
      monthlyDeposit: null,
      paused: false,
      _reached50: false,
      _completedNotified: false,
    });
  });

  // 第3步：习惯型子目标
  actions.forEach(function(label) {
    // 自动判断是习惯型
    children.push({
      id: uuid(),
      name: label,
      type: 'habit',
      target: 100,
      startVal: 0,
      unit: '次',
      currentValue: 0,
      weight: weight,
      weeklyTarget: 3,
      checkins: [],
      completed: false,
      completedDate: null,
      createdDate: new Date().toISOString(),
      deadline: null,
      fields: [],
      quickButtons: null,
      monthlyDeposit: null,
      paused: false,
      _reached50: false,
      _completedNotified: false,
    });
  });

  var goal = {
    id: uuid(),
    name: resultName,
    why: '',
    type: 'composite',
    children: children,
    completed: false,
    completedDate: null,
    createdDate: new Date().toISOString(),
    paused: false,
    deadline: null,
    checkins: [],
  };

  var goals = loadGoals();
  goals.push(goal);
  saveGoals(goals);

  // 关闭向导
  if (window._closeDecomposeWizard) window._closeDecomposeWizard();
  // 关闭目标弹窗
  var goalModal = document.getElementById('goal-modal');
  closeAnyModal(goalModal);

  renderGoals();

  // 首次创建复合目标 → coach marks
  var coachShown = localStorage.getItem(STORAGE_COACH_SHOWN);
  if (!coachShown) {
    setTimeout(function() {
      showCoachMarks();
    }, 400);
  }

  showToast('拆解完成。每个小块都可以单独打卡', 'success', { duration: 4000 });
}

function initGoalModal() {
  var modal = document.getElementById('goal-modal');
  var form = document.getElementById('goal-form');
  var typeSelect = document.getElementById('goal-type-select');

  typeSelect.addEventListener('change', function() {
    adaptGoalFormByType(typeSelect.value);
    updateQuickButtonPreview();
  });

  // 目标值/截止日期变化时更新预览
  form.querySelector('[name="target"]').addEventListener('input', updateQuickButtonPreview);
  form.querySelector('[name="deadline"]').addEventListener('change', updateQuickButtonPreview);

  // 添加目标按钮
  document.getElementById('goal-add-btn').addEventListener('click', function() {
    openGoalModal(null);
  });

  // 模板库入口
  var templateBtn = document.getElementById('goal-template-btn');
  if (templateBtn) {
    templateBtn.addEventListener('click', function() {
      openTemplateModal();
    });
  }

  // 拆解向导入口
  var decomposeBtn = document.getElementById('goal-decompose-btn');
  if (decomposeBtn) {
    decomposeBtn.addEventListener('click', function() {
      closeAnyModal(document.getElementById('goal-modal'));
      openDecomposeWizard();
    });
  }

  // 存为我的模板
  var saveTplBtn = document.getElementById('save-as-template-btn');
  if (saveTplBtn) {
    saveTplBtn.addEventListener('click', function() {
      saveCurrentAsTemplate();
    });
  }

  // 快捷按钮自定义展开/收起
  var previewEl = document.getElementById('quick-btn-preview');
  var customArea = document.getElementById('quick-btn-custom');
  if (previewEl && customArea) {
    previewEl.addEventListener('click', function() {
      customArea.hidden = !customArea.hidden;
    });
  }

  // 打卡字段添加按钮
  form.querySelectorAll('[data-add-field]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      addGoalField(btn.dataset.addField);
    });
  });

  modal.querySelectorAll('[data-close-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var type = fd.get('type');
    var editId = fd.get('editId');
    var name = fd.get('name').trim();
    var why = (fd.get('why') || '').trim();
    var unit = (fd.get('unit') || '').trim() || '';
    var deadline = fd.get('deadline') || null;
    var target = parseFloat(fd.get('target')) || 0;
    var startVal = parseFloat(fd.get('startVal')) || 0;
    var weeklyTarget = parseInt(fd.get('weeklyTarget')) || 3;
    var monthlyDeposit = parseFloat(fd.get('monthlyDeposit')) || 0;
    if (type !== 'cumulative') monthlyDeposit = 0;

    // 读取自定义快捷按钮
    var quickButtons = null;
    var customInputs = form.querySelectorAll('.quick-btn-custom-input');
    if (customInputs.length >= 3 && type === 'cumulative') {
      var b1 = parseInt(customInputs[0].value) || 0;
      var b2 = parseInt(customInputs[1].value) || 0;
      var b3 = parseInt(customInputs[2].value) || 0;
      if (b1 > 0 && b2 > 0 && b3 > 0) {
        quickButtons = [b1, b2, b3];
      }
    }

    if (editId) {
      // 编辑模式
      var goals0 = loadGoals();
      var g0 = goals0.find(function(g) { return g.id === editId; });
      if (!g0) return;
      g0.name = name;
      g0.why = why;
      g0.type = type;
      g0.deadline = deadline;
      g0.unit = unit;
      if (quickButtons) g0.quickButtons = quickButtons;
      g0.fields = getGoalFieldsFromForm();
      g0.monthlyDeposit = monthlyDeposit > 0 ? monthlyDeposit : null;
      if (type === 'habit') {
        g0.weeklyTarget = weeklyTarget;
        g0.target = target;
      } else if (type === 'value') {
        g0.target = target;
        g0.startVal = startVal;
      } else if (type === 'cumulative') {
        g0.target = target;
      } else if (type === 'milestone') {
        var lines = (fd.get('milestones') || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        var oldMs = {};
        (g0.milestones || []).forEach(function(m) { oldMs[m.label] = m.done; });
        g0.milestones = lines.map(function(label) { return { label: label, done: !!oldMs[label] }; });
        g0.target = g0.milestones.length;
        g0.currentValue = g0.milestones.filter(function(m) { return m.done; }).length;
      }
      saveGoals(goals0);
      closeAnyModal(modal);
      renderGoals();
      showToast('目标已更新', 'success');
    } else {
      // 新建模式
      var goal = {
        id: uuid(),
        name: name,
        why: why,
        type: type,
        target: target,
        startVal: type === 'value' ? startVal : 0,
        unit: unit,
        deadline: deadline,
        weeklyTarget: type === 'habit' ? weeklyTarget : null,
        currentValue: type === 'value' ? startVal : 0,
        checkins: [],
        completed: false,
        completedDate: null,
        createdDate: new Date().toISOString(),
        paused: false,
        quickButtons: quickButtons,
        fields: getGoalFieldsFromForm(),
        monthlyDeposit: monthlyDeposit > 0 ? monthlyDeposit : null,
        _reached50: false,
        _completedNotified: false,
      };
      if (type === 'milestone') {
        var lines2 = (fd.get('milestones') || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        goal.milestones = lines2.map(function(label) { return { label: label, done: false }; });
        goal.target = goal.milestones.length;
        goal.currentValue = 0;
      }
      var goals2 = loadGoals();
      goals2.push(goal);
      saveGoals(goals2);
      closeAnyModal(modal);
      renderGoals();
      showToast('目标已创建', 'success');

      // 如果勾选了「与同行者一起做」，发起共同目标邀请
      var sharedCb = document.getElementById('goal-shared-checkbox');
      if (sharedCb && sharedCb.checked && (type === 'cumulative' || type === 'habit')) {
        if (window.syncAdapter && syncAdapter.isReady()) {
          var partner = loadJSON(STORAGE_PARTNER, null);
          if (partner && partner.uid) {
            syncAdapter.createSharedGoal({
              creatorName: getUserName() || '匿名',
              name: name,
              type: type,
              target: target,
              unit: unit,
              why: why,
              weeklyTarget: type === 'habit' ? weeklyTarget : null
            }).then(function(cloudId) {
              if (cloudId) {
                // 本地记录
                var sharedGoals = loadJSON('lifeos_shared_goals', []);
                sharedGoals.push({
                  cloudId: cloudId,
                  localGoalId: goal.id,
                  name: name,
                  type: type,
                  target: target,
                  unit: unit,
                  role: 'creator',
                  status: 'pending',
                  myContribution: 0,
                  partnerContribution: 0,
                  myCheckinDates: [],
                  partnerCheckinDates: [],
                  createdAt: Date.now()
                });
                saveJSON('lifeos_shared_goals', sharedGoals);
                showToast('已向「' + (partner.name || 'TA') + '」发起共同目标邀请', 'success', { duration: 4000 });
              } else {
                showToast('共同目标邀请发送失败，稍后再试', 'warning');
              }
            });
          }
        }
      }
    }
  });
}

// ============================================================
// 目标 — 详情 & 打卡（完整重写）
// ============================================================

// ============================================================
// 复合目标 — 详情 & 子目标打卡
// ============================================================

function openCompositeDetail(id) {
  var goals = loadGoals();
  var goal = goals.find(function(g) { return g.id === id; });
  if (!goal) return;

  var modal = document.getElementById('goal-detail-modal');
  var content = document.getElementById('goal-detail-content');
  var progress = calcCompositeProgress(goal);

  var html = '';

  // ---- 头部 ----
  html += '<div class="detail-header">';
  html +=   '<h2>复合目标</h2>';
  html +=   '<div class="detail-header__actions">';
  if (!goal.completed && !goal.paused) {
    html += '<button class="btn btn--ghost btn--small" id="goal-pause-btn" type="button">暂停</button>';
  } else if (goal.paused) {
    html += '<button class="btn btn--primary btn--small" id="goal-resume-btn" type="button">恢复</button>';
  }
  html += '<button class="btn btn--ghost btn--small" id="goal-edit-btn" type="button">编辑</button>';
  html += '</div>';
  html += '</div>';

  // ---- 北极星区 ----
  html += '<div class="composite-detail-header">';
  html +=   '<div class="composite-detail-header__star">⭐</div>';
  html +=   '<div class="composite-detail-header__name">' + escapeHtml(goal.name) + '</div>';
  html +=   '<div class="composite-detail-header__hint">这是方向，不是进度条——看下面的子目标</div>';
  html += '</div>';

  if (goal.why) {
    html += '<div class="detail-why">' +
      '<span class="detail-why__label">为什么</span>' +
      '<span class="detail-why__text">' + escapeHtml(goal.why) + '</span>' +
    '</div>';
  }

  // ---- 总进度 ----
  html += '<div class="composite-detail-overview">';
  html +=   '<div>';
  html +=     '<div class="composite-detail-overview__progress">' + Math.round(progress * 100) + '%</div>';
  html +=     '<div class="composite-detail-overview__label">总进度（加权平均）</div>';
  html +=   '</div>';
  html += '</div>';

  // ---- 子目标列表 ----
  if (goal.children && goal.children.length > 0) {
    html += '<h3 class="section-title">子目标</h3>';
    var typeLabels = {cumulative:'累计型',habit:'习惯型',milestone:'里程碑型',value:'数值型'};
    goal.children.forEach(function(c) {
      var cProg = calcProgress(c);
      var cPct = Math.round(cProg * 100);
      var todayChecked = (c.checkins || []).some(function(ci) { return ci.date === todayKey(); });
      var streak = calcStreak(c.checkins || []);

      html += '<div class="composite-subgoal-card" data-subgoal-id="' + c.id + '">';
      html +=   '<div class="composite-subgoal-card__header">';
      html +=     '<span class="composite-subgoal-card__name">' + escapeHtml(c.name) + (c.completed ? ' ✓' : '') + '</span>';
      html +=     '<span class="composite-subgoal-card__type">' + (typeLabels[c.type] || c.type) + '</span>';
      html +=   '</div>';
      html +=   '<div class="composite-subgoal-card__bar"><div class="composite-subgoal-card__fill" style="width:' + cPct + '%"></div></div>';
      html +=   '<div class="composite-subgoal-card__meta">';
      html +=     '<span>' + (c.completed ? '已完成' : (todayChecked ? '今日已打卡' : '今日未打卡')) + (streak > 0 ? ' · 🔥' + streak : '') + '</span>';
      html +=     '<span class="composite-subgoal-card__weight">权重 ' + (c.weight || 1) + '</span>';
      html +=   '</div>';
      html += '</div>';
    });

    // ---- 权重编辑区 ----
    html += '<h3 class="section-title" style="margin-top:var(--s-6)">权重调整</h3>';
    html += '<p class="weight-guide">哪个更拉分，就把哪个调重</p>';
    goal.children.forEach(function(c, i) {
      html += '<div class="weight-slider-row">';
      html +=   '<span class="weight-slider-row__label">' + escapeHtml(c.name) + '</span>';
      html +=   '<input type="range" class="weight-slider-row__slider" min="0.5" max="5" step="0.5" value="' + (c.weight || 1) + '" data-weight-idx="' + i + '">';
      html +=   '<span class="weight-slider-row__value" data-weight-val="' + i + '">' + (c.weight || 1) + '</span>';
      html += '</div>';
    });
  } else {
    html += '<p class="composite-empty-hint">把它拆小，每一块就都有了进度</p>';
  }

  // ---- 删除按钮 ----
  html += '<div style="margin-top:var(--s-12);padding-top:var(--s-6);border-top:1px solid var(--border)">';
  html +=   '<button class="btn btn--ghost btn--danger-weak" id="goal-delete-btn" type="button">删除此目标</button>';
  html += '</div>';

  content.innerHTML = html;
  modal.hidden = false;
  trapFocus(modal);

  // ---- 编辑 ----
  var editBtn = content.querySelector('#goal-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function() {
      closeAnyModal(modal);
      openCompositeEditModal(id);
    });
  }

  // ---- 暂停/恢复 ----
  var pauseBtn = content.querySelector('#goal-pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function() {
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      g2.paused = true;
      saveGoals(gs2);
      openCompositeDetail(id);
      renderGoals();
      showToast('目标已暂停。在休息，不是放弃', 'success');
    });
  }
  var resumeBtn = content.querySelector('#goal-resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function() {
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      g2.paused = false;
      saveGoals(gs2);
      openCompositeDetail(id);
      renderGoals();
      showToast('目标已恢复。欢迎回来', 'success');
    });
  }

  // ---- 子目标点击 ----
  content.querySelectorAll('.composite-subgoal-card').forEach(function(card) {
    card.addEventListener('click', function() {
      openSubGoalDetail(id, card.dataset.subgoalId);
    });
  });

  // ---- 权重滑块 ----
  content.querySelectorAll('.weight-slider-row__slider').forEach(function(slider) {
    slider.addEventListener('input', function() {
      var idx = parseInt(slider.dataset.weightIdx);
      var val = parseFloat(slider.value);
      var valEl = content.querySelector('[data-weight-val="' + idx + '"]');
      if (valEl) valEl.textContent = val;
    });
    slider.addEventListener('change', function() {
      var idx = parseInt(slider.dataset.weightIdx);
      var val = parseFloat(slider.value);
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      if (g2 && g2.children && g2.children[idx]) {
        g2.children[idx].weight = val;
        saveGoals(gs2);
        openCompositeDetail(id);
        renderGoals();
      }
    });
  });

  // ---- 删除 ----
  var delBtn = content.querySelector('#goal-delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', function() {
      confirmDelete('删除复合目标', '确定删除「' + goal.name + '」及其所有子目标？此操作不可撤销。', function() {
        saveGoals(loadGoals().filter(function(g) { return g.id !== id; }));
        closeAnyModal(modal);
        renderGoals();
        showToast('目标已删除', 'success');
      });
    });
  }
}

// ---- 子目标详情 ----
function openSubGoalDetail(parentId, childId) {
  var goals = loadGoals();
  var parent = goals.find(function(g) { return g.id === parentId; });
  if (!parent || !parent.children) return;
  var child = parent.children.find(function(c) { return c.id === childId; });
  if (!child) return;

  var modal = document.getElementById('goal-detail-modal');
  var content = document.getElementById('goal-detail-content');
  var progress = calcProgress(child);
  var streak = calcStreak(child.checkins || []);
  var maxStreak = calcMaxStreak(child.checkins || []);
  var typeLabel = {cumulative:'累计型',habit:'习惯型',milestone:'里程碑型',value:'数值型'}[child.type] || child.type;

  // 断卡检测
  var lastDate = getLastCheckinDate(child);
  var daysSince = lastDate ? daysBetween(lastDate, todayKey()) : 999;
  var isReturn = daysSince >= 3 && !child.completed && !child.paused;

  var html = '';

  // ---- 返回按钮 ----
  html += '<div class="detail-header">';
  html +=   '<button class="btn btn--ghost btn--small" id="subgoal-back-btn" type="button">← 返回「' + escapeHtml(parent.name) + '」</button>';
  html += '</div>';

  // ---- 名称区 ----
  html += '<div style="margin-bottom:var(--s-4)">';
  html +=   '<span style="font-size:11px;color:var(--t-3)">' + typeLabel + ' · 属于「' + escapeHtml(parent.name) + '」</span>';
  html +=   '<h2 style="margin-top:var(--s-2)">' + escapeHtml(child.name) + '</h2>';
  html += '</div>';

  // ---- 大环形进度 ----
  html += '<div style="display:flex;justify-content:center;margin-bottom:var(--s-4)">' + ringSVG(progress, 140) + '</div>';

  // ---- 断卡回归 ----
  if (isReturn) {
    html += '<div class="detail-return-banner">欢迎回来。中断是人之常情，回来就是本事</div>';
  }
  if (isReturn && maxStreak > 0) {
    html += '<div class="detail-streak-return">' +
      '<span class="detail-streak-return__old">历史最长 ' + maxStreak + ' 天</span>' +
      '<span class="detail-streak-return__new">重新出发第1天</span>' +
    '</div>';
  } else if (streak > 0) {
    html += '<div class="detail-streak">🔥 连续 ' + streak + ' 天</div>';
  }

  // ---- 存钱类节奏 ----
  if (child.monthlyDeposit && child.monthlyDeposit > 0 && child.type === 'cumulative' && !child.completed) {
    var monthDep = child.monthlyDeposit;
    var now = new Date();
    var monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var monthTotal = 0;
    (child.checkins || []).forEach(function(c) {
      if (c.date && c.date.startsWith(monthKey)) {
        monthTotal += (c.amount || 0);
      }
    });
    var dayOfMonth = now.getDate();
    html += '<div class="saving-rhythm-banner">';
    if (dayOfMonth <= 3) {
      html += '<p class="saving-rhythm-banner__text">这个月的目标：存下 <span class="saving-rhythm-banner__amount">' + monthDep + '</span> ' + escapeHtml(child.unit || '元') + '</p>';
    }
    html += '<p class="saving-rhythm-banner__text">本月已存 ' + monthTotal + ' / ' + monthDep + ' ' + escapeHtml(child.unit || '元') + (monthTotal >= monthDep ? ' · 达标了，稳' : ' · 还差 ' + (monthDep - monthTotal)) + '</p>';
    html += '</div>';
  }

  // ---- 习惯型本周圆点 ----
  if (child.type === 'habit' && !child.completed && !child.paused) {
    var weekCheckins = getWeekCheckinCount(child);
    var weeklyTarget = child.weeklyTarget || 3;
    var dotsHTML = '';
    for (var d = 0; d < 7; d++) {
      var isDone = d < weekCheckins;
      dotsHTML += '<span class="habit-dot ' + (isDone ? 'habit-dot--done' : '') + '"></span>';
    }
    var remaining = Math.max(0, weeklyTarget - weekCheckins);
    html += '<div class="habit-weekly">';
    html +=   '<div class="habit-weekly__dots">' + dotsHTML + '</div>';
    html +=   '<p class="habit-weekly__text">' + (remaining > 0 ? '这周还差' + remaining + '次' : '这周已达标，稳') + '</p>';
    html += '</div>';
  }

  // ---- 打卡区域 ----
  if (!child.completed && !child.paused) {
    if (child.type !== 'milestone') {
      var quickBtns = calcQuickButtons(child);
      html += '<h3 class="section-title" style="margin-top:var(--s-6)">' + (child.type === 'value' ? '录入当前值' : '快捷打卡') + '</h3>';
      html += '<div class="checkin-area">';

      if (child.type === 'value') {
        html += '<div class="field" style="flex:1"><span class="field__label">当前值</span><input type="number" id="checkin-amount" class="field__input" value="' + (child.currentValue||0) + '" step="any"></div>';
        html += '<button class="btn btn--primary" id="checkin-btn" type="button">记录</button>';
      } else {
        quickBtns.forEach(function(amt) {
          var display = child.type === 'habit' ? '+1次' : '+' + amt;
          html += '<button class="btn btn--primary btn--small checkin-quick" data-amount="' + amt + '" type="button">' + display + '</button>';
        });
        html += '<div class="field" style="flex:1;max-width:120px"><span class="field__label">自定义</span><input type="number" id="checkin-amount" class="field__input" value="1" min="0" step="any"></div>';
        html += '<button class="btn btn--primary btn--small" id="checkin-btn" type="button">打卡</button>';
      }
      html += '</div>';

      // 状态标签
      html += '<div class="checkin-tags">';
      html +=   '<button class="checkin-tag" data-tag="好" type="button">状态好</button>';
      html +=   '<button class="checkin-tag" data-tag="一般" type="button">一般</button>';
      html +=   '<button class="checkin-tag" data-tag="硬撑" type="button">硬撑</button>';
      html += '</div>';

      // 补录日期 + 备注
      html += '<div class="field" style="margin-bottom:var(--s-4)"><span class="field__label">打卡日期</span><input type="date" id="checkin-date" class="field__input" value="' + todayKey() + '"></div>';
      html += '<div class="field" style="margin-bottom:var(--s-3)"><span class="field__label">一句话备注</span><input type="text" id="checkin-note" class="field__input" placeholder="今天的情况…"></div>';
    }
  } else if (child.completed) {
    html += '<p class="empty-hint">该子目标已完成 🎉</p>';
  }

  // ---- 趋势图 ----
  html += '<h3 class="section-title">近30天趋势</h3>';
  if (child.checkins && child.checkins.length > 0) {
    html += '<div class="chart-wrap"><canvas id="trend-canvas"></canvas></div>';
  } else {
    html += '<p class="empty-hint" style="padding:var(--s-6) 0">暂无打卡数据，开始打卡后这里会显示趋势图</p>';
  }

  // ---- 打卡记录 ----
  if (child.checkins && child.checkins.length > 0) {
    html += '<h3 class="section-title">打卡记录</h3><div class="checkin-history">';
    child.checkins.slice().reverse().forEach(function(c, i) {
      var realIdx = child.checkins.length - 1 - i;
      var amountText = '';
      if (child.type === 'value') {
        amountText = '记录值: ' + (c.cumulative !== undefined ? c.cumulative : c.amount);
      } else if (c.amount) {
        amountText = '+' + c.amount;
      }
      var tagBadge = c.tag ? '<span class="log-item__tag log-item__tag--' + c.tag + '">' + c.tag + '</span>' : '';
      html += '<div class="log-item">' +
        '<div class="log-item__main">' +
          '<span class="log-item__time">' + (c.date || '') + (c.time ? ' ' + c.time : '') + '</span>' +
          (amountText ? '<span class="log-item__amount">' + escapeHtml(amountText) + '</span>' : '') +
          tagBadge +
          (c.note ? '<p class="log-item__content">' + escapeHtml(c.note) + '</p>' : '') +
        '</div>' +
        '<button class="log-item__del" data-checkin-idx="' + realIdx + '" type="button">删除</button>' +
      '</div>';
    });
    html += '</div>';
  }

  content.innerHTML = html;
  modal.hidden = false;
  trapFocus(modal);

  // ---- 返回父目标 ----
  var backBtn = content.querySelector('#subgoal-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      openCompositeDetail(parentId);
    });
  }

  // ---- 状态标签 ----
  var selectedTag = '';
  content.querySelectorAll('.checkin-tag').forEach(function(tag) {
    tag.addEventListener('click', function() {
      content.querySelectorAll('.checkin-tag').forEach(function(t) { t.classList.remove('checkin-tag--active'); });
      tag.classList.add('checkin-tag--active');
      selectedTag = tag.dataset.tag;
    });
  });

  // ---- 快捷打卡 ----
  content.querySelectorAll('.checkin-quick').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var amount = parseFloat(btn.dataset.amount) || 0;
      var noteEl = document.getElementById('checkin-note');
      var dateEl = document.getElementById('checkin-date');
      var note = noteEl ? noteEl.value.trim() : '';
      var date = dateEl ? dateEl.value : todayKey();
      doSubGoalCheckin(parentId, childId, amount, note, date, selectedTag);
      selectedTag = '';
    });
  });

  // ---- 自定义打卡 / 数值型 ----
  var checkinBtn = content.querySelector('#checkin-btn');
  if (checkinBtn) {
    checkinBtn.addEventListener('click', function() {
      var amountEl = document.getElementById('checkin-amount');
      var noteEl = document.getElementById('checkin-note');
      var dateEl = document.getElementById('checkin-date');
      var note = noteEl ? noteEl.value.trim() : '';
      var date = dateEl ? dateEl.value : todayKey();

      if (child.type === 'value') {
        var newVal = parseFloat(amountEl.value) || 0;
        doSubGoalValueCheckin(parentId, childId, newVal, note, date, selectedTag);
      } else {
        var amount = parseFloat(amountEl.value) || 0;
        doSubGoalCheckin(parentId, childId, amount, note, date, selectedTag);
      }
      selectedTag = '';
    });
  }

  // ---- 打卡记录删除 ----
  content.querySelectorAll('.log-item__del').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(el.dataset.checkinIdx);
      confirmDelete('删除打卡记录', '确定删除这条打卡记录？', function() {
        var gs2 = loadGoals();
        var p2 = gs2.find(function(g) { return g.id === parentId; });
        if (!p2 || !p2.children) return;
        var c2 = p2.children.find(function(c) { return c.id === childId; });
        if (!c2 || !c2.checkins || idx < 0 || idx >= c2.checkins.length) return;

        var deleted = c2.checkins[idx];
        if (c2.type === 'value') {
          if (idx > 0) {
            c2.currentValue = c2.checkins[idx - 1].cumulative !== undefined ? c2.checkins[idx - 1].cumulative : c2.startVal;
          } else {
            c2.currentValue = c2.startVal;
          }
        } else if (c2.type !== 'milestone') {
          c2.currentValue = (c2.currentValue || 0) - (deleted.amount || 0);
          if (c2.currentValue < 0) c2.currentValue = 0;
        }
        c2.checkins.splice(idx, 1);

        if (c2.type === 'value') {
          var cum = c2.startVal;
          c2.checkins.forEach(function(c) { cum = c.cumulative !== undefined ? c.cumulative : cum; });
          c2.currentValue = cum;
        }

        if (c2.completed && calcProgress(c2) < 1) {
          c2.completed = false;
          c2.completedDate = null;
        }

        // 检查父目标完成
        checkCompositeCompletion(p2);

        saveGoals(gs2);
        openSubGoalDetail(parentId, childId);
        renderGoals();
        showToast('打卡记录已删除', 'success');
      });
    });
  });

  // 趋势图绘制
  if (child.checkins && child.checkins.length > 0) {
    setTimeout(function() {
      drawTrendChart(child);
    }, 50);
  }
}

// ---- 子目标打卡（累计/习惯）----
function doSubGoalCheckin(parentId, childId, amount, note, checkinDate, tag) {
  if (amount <= 0) {
    showToast('打卡量必须大于0', 'warning');
    return;
  }
  var goals = loadGoals();
  var parent = goals.find(function(g) { return g.id === parentId; });
  if (!parent || !parent.children) return;
  var child = parent.children.find(function(c) { return c.id === childId; });
  if (!child || child.completed || child.paused) return;

  var lastDate = getLastCheckinDate(child);
  var isReturn = lastDate && daysBetween(lastDate, todayKey()) >= 3;

  var now = new Date();
  var date = checkinDate || todayKey();
  if (date !== todayKey()) {
    var diff = daysBetween(date, todayKey());
    if (diff > 7) {
      showToast('最多只能补录7天内的打卡', 'warning');
      return;
    }
  }
  var checkin = {
    date: date,
    time: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    amount: amount,
    note: note,
    tag: tag || '',
    extras: null,
  };
  if (!child.checkins) child.checkins = [];
  child.checkins.push(checkin);
  child.currentValue = (child.currentValue || 0) + amount;

  var justCompleted = false;
  if (child.type !== 'milestone' && child.target > 0 && child.currentValue >= child.target && !child.completed) {
    child.completed = true;
    child.completedDate = new Date().toISOString();
    justCompleted = true;
  }

  // 检查父目标完成
  checkCompositeCompletion(parent);

  saveGoals(goals);
  syncToCloud(parentId);
  openSubGoalDetail(parentId, childId);
  renderGoals();

  if (justCompleted) {
    showToast('子目标完成了。「' + child.name + '」做到了', 'success', { duration: 4000 });
  } else if (isReturn) {
    showToast('欢迎回来。中断是人之常情，回来就是本事', 'success', { duration: 4000 });
  } else {
    showToast('+' + amount + '。' + randomEncourage(), 'success');
  }
}

// ---- 子目标数值型打卡 ----
function doSubGoalValueCheckin(parentId, childId, newVal, note, checkinDate, tag) {
  var goals = loadGoals();
  var parent = goals.find(function(g) { return g.id === parentId; });
  if (!parent || !parent.children) return;
  var child = parent.children.find(function(c) { return c.id === childId; });
  if (!child || child.completed || child.paused) return;

  var now = new Date();
  var date = checkinDate || todayKey();
  if (date !== todayKey()) {
    var diff = daysBetween(date, todayKey());
    if (diff > 7) {
      showToast('最多只能补录7天内的打卡', 'warning');
      return;
    }
  }
  var checkin = {
    date: date,
    time: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    amount: 0,
    cumulative: newVal,
    note: note,
    tag: tag || '',
    extras: null,
  };
  if (!child.checkins) child.checkins = [];
  child.checkins.push(checkin);
  child.currentValue = newVal;

  var justCompleted = false;
  if (child.target > 0 && child.currentValue >= child.target && !child.completed && child.startVal < child.target) {
    child.completed = true;
    child.completedDate = new Date().toISOString();
    justCompleted = true;
  } else if (child.target > 0 && child.currentValue <= child.target && !child.completed && child.startVal > child.target) {
    child.completed = true;
    child.completedDate = new Date().toISOString();
    justCompleted = true;
  }

  checkCompositeCompletion(parent);
  saveGoals(goals);
  syncToCloud(parentId);
  openSubGoalDetail(parentId, childId);
  renderGoals();

  if (justCompleted) {
    showToast('子目标完成了。「' + child.name + '」做到了', 'success', { duration: 4000 });
  } else {
    showToast('已记录', 'success');
  }
}

// ---- 检查复合目标是否全部完成 ----
function checkCompositeCompletion(parent) {
  if (!parent.children || parent.children.length === 0) return;
  var allDone = parent.children.every(function(c) { return c.completed; });
  if (allDone && !parent.completed) {
    parent.completed = true;
    parent.completedDate = new Date().toISOString();
    addTimelineFromGoal(parent);
  } else if (!allDone && parent.completed) {
    parent.completed = false;
    parent.completedDate = null;
  }
}

// ---- 复合目标编辑弹窗 ----
function openCompositeEditModal(id) {
  var goals = loadGoals();
  var goal = goals.find(function(g) { return g.id === id; });
  if (!goal) return;

  var modal = document.getElementById('confirm-modal');
  var titleEl = document.getElementById('confirm-title');
  var descEl = document.getElementById('confirm-desc');
  var actionsEl = modal.querySelector('.confirm-modal__actions');

  titleEl.textContent = '编辑复合目标';
  var html = '';
  html += '<div style="text-align:left">';
  html += '<label class="field"><span class="field__label">目标名称（北极星）</span><input type="text" class="field__input" id="comp-edit-name" value="' + escapeHtml(goal.name) + '"></label>';
  html += '<label class="field"><span class="field__label">一句为什么</span><input type="text" class="field__input" id="comp-edit-why" value="' + escapeHtml(goal.why || '') + '"></label>';
  html += '<p class="template-group-title" style="margin-top:var(--s-5)">子目标</p>';
  if (goal.children && goal.children.length > 0) {
    goal.children.forEach(function(c, i) {
      html += '<div style="background:var(--bg-card);padding:var(--s-3);border-radius:var(--r-sm);margin-bottom:var(--s-2)">';
      html += '<input type="text" class="field__input" id="comp-child-name-' + i + '" value="' + escapeHtml(c.name) + '" placeholder="子目标名" style="margin-bottom:var(--s-2)">';
      html += '<div style="display:flex;gap:var(--s-2);align-items:center">';
      html += '<span style="font-size:11px;color:var(--t-3)">权重</span>';
      html += '<input type="number" class="field__input" id="comp-child-weight-' + i + '" value="' + (c.weight || 1) + '" min="0.5" max="5" step="0.5" style="max-width:80px">';
      html += '<span style="font-size:11px;color:var(--t-3)">' + ({cumulative:'累计',habit:'习惯',value:'数值',milestone:'里程碑'}[c.type] || c.type) + '</span>';
      html += '</div>';
      html += '</div>';
    });
  }
  html += '</div>';

  descEl.innerHTML = html;
  actionsEl.innerHTML = '<button type="button" class="btn btn--ghost" id="comp-edit-cancel">取消</button><button type="button" class="btn btn--primary" id="comp-edit-save">保存</button>';
  modal.hidden = false;

  document.getElementById('comp-edit-cancel').addEventListener('click', function() {
    closeAnyModal(modal);
    restoreConfirmActions();
  });
  document.getElementById('comp-edit-save').addEventListener('click', function() {
    var gs2 = loadGoals();
    var g2 = gs2.find(function(g) { return g.id === id; });
    if (!g2) return;
    g2.name = document.getElementById('comp-edit-name').value.trim() || g2.name;
    g2.why = document.getElementById('comp-edit-why').value.trim();
    if (g2.children) {
      g2.children.forEach(function(c, i) {
        var nameEl = document.getElementById('comp-child-name-' + i);
        var weightEl = document.getElementById('comp-child-weight-' + i);
        if (nameEl) c.name = nameEl.value.trim() || c.name;
        if (weightEl) c.weight = parseFloat(weightEl.value) || 1;
      });
    }
    saveGoals(gs2);
    closeAnyModal(modal);
    restoreConfirmActions();
    openCompositeDetail(id);
    renderGoals();
    showToast('目标已更新', 'success');
  });
}

function openGoalDetail(id) {
  var goals = loadGoals();
  var goal = goals.find(function(g) { return g.id === id; });
  if (!goal) return;

  // ---- 复合目标走单独渲染 ----
  if (goal.type === 'composite') {
    openCompositeDetail(id);
    return;
  }

  var modal = document.getElementById('goal-detail-modal');
  var content = document.getElementById('goal-detail-content');
  var progress = calcProgress(goal);
  var streak = calcStreak(goal.checkins || []);
  var maxStreak = calcMaxStreak(goal.checkins || []);
  var comment = humanComment(goal);
  var typeLabel = {cumulative:'累计型',habit:'习惯型',milestone:'里程碑型',value:'数值型'}[goal.type];

  // 断卡检测
  var lastDate = getLastCheckinDate(goal);
  var daysSince = lastDate ? daysBetween(lastDate, todayKey()) : 999;
  var isReturn = daysSince >= 3 && !goal.completed && !goal.paused;

  // 停滞检测
  var isStagnant = daysSince >= 5 && !goal.completed && !goal.paused;

  // 逃生口检测（落后很多）
  var isFarBehind = false;
  if (goal.deadline && !goal.completed) {
    var pace = calcPace(goal);
    var cd = calcCountdown(goal.deadline);
    if (pace === 'red' || (cd.overdue && cd.days > 7)) isFarBehind = true;
  }

  var html = '';

  // ---- 头部：名称 + 编辑按钮 ----
  html += '<div class="detail-header">';
  html +=   '<h2>' + escapeHtml(goal.name) + '</h2>';
  html +=   '<div class="detail-header__actions">';
  if (!goal.completed && !goal.paused) {
    html += '<button class="btn btn--ghost btn--small" id="goal-pause-btn" type="button">暂停</button>';
  } else if (goal.paused) {
    html += '<button class="btn btn--primary btn--small" id="goal-resume-btn" type="button">恢复</button>';
  }
  html += '<button class="btn btn--ghost btn--small" id="goal-edit-btn" type="button">编辑</button>';
  html += '</div>';
  html += '</div>';

  // ---- "为什么" 钉在最上方 ----
  if (goal.why) {
    var whyClass = 'detail-why';
    if (isStagnant) whyClass += ' detail-why--highlight';
    html += '<div class="' + whyClass + '" id="detail-why">' +
      '<span class="detail-why__label">为什么</span>' +
      '<span class="detail-why__text">' + escapeHtml(goal.why) + '</span>' +
    '</div>';
  }

  // ---- 大环形进度 ----
  html += '<div style="display:flex;justify-content:center;margin-bottom:var(--s-4)">' + ringSVG(progress, 140) + '</div>';

  // ---- 人话评语 ----
  html += '<div class="detail-comment">' + escapeHtml(comment) + '</div>';

  // ---- 断卡回归提示 ----
  if (isReturn) {
    html += '<div class="detail-return-banner">欢迎回来。中断是人之常情，回来就是本事</div>';
  }

  // ---- 断卡回归streak显示 ----
  if (isReturn && maxStreak > 0) {
    html += '<div class="detail-streak-return">' +
      '<span class="detail-streak-return__old">历史最长 ' + maxStreak + ' 天</span>' +
      '<span class="detail-streak-return__new">重新出发第1天</span>' +
    '</div>';
  } else if (streak > 0) {
    html += '<div class="detail-streak">🔥 连续 ' + streak + ' 天</div>';
  }

  // ---- 存钱类节奏横幅 ----
  if (goal.monthlyDeposit && goal.monthlyDeposit > 0 && goal.type === 'cumulative' && !goal.completed) {
    var _monthDep = goal.monthlyDeposit;
    var _nowDep = new Date();
    var _monthKey = _nowDep.getFullYear() + '-' + String(_nowDep.getMonth() + 1).padStart(2, '0');
    var _monthTotal = 0;
    (goal.checkins || []).forEach(function(c) {
      if (c.date && c.date.startsWith(_monthKey)) _monthTotal += (c.amount || 0);
    });
    var _dayOfMonth = _nowDep.getDate();
    html += '<div class="saving-rhythm-banner">';
    if (_dayOfMonth <= 3) {
      html += '<p class="saving-rhythm-banner__text">这个月的目标：存下 <span class="saving-rhythm-banner__amount">' + _monthDep + '</span> ' + escapeHtml(goal.unit || '元') + '</p>';
    }
    html += '<p class="saving-rhythm-banner__text">本月已存 ' + _monthTotal + ' / ' + _monthDep + ' ' + escapeHtml(goal.unit || '元') + (_monthTotal >= _monthDep ? ' · 达标了，稳' : ' · 还差 ' + (_monthDep - _monthTotal)) + '</p>';
    html += '</div>';
  }

  // ---- 节奏条 ----
  if (goal.deadline && !goal.completed && !goal.paused) {
    var pace = calcPace(goal);
    var cd = calcCountdown(goal.deadline);
    var totalDays = goal.createdDate ? daysBetween(goal.createdDate, goal.deadline) : 0;
    var elapsedDays = goal.createdDate ? daysBetween(goal.createdDate, new Date().toISOString()) : 0;
    var expectedProgress = totalDays > 0 ? Math.min(1, elapsedDays / totalDays) : 0;
    var actualProgress = progress;

    var paceComment = '';
    if (pace === 'green') paceComment = '追上了，稳';
    else if (pace === 'yellow') paceComment = '差一步，一次打卡就回来';
    else if (pace === 'red') paceComment = '差得有点远';

    html += '<div class="pace-bar">';
    html +=   '<div class="pace-bar__track">';
    html +=     '<div class="pace-bar__expected" style="left:' + (expectedProgress * 100) + '%"></div>';
    html +=     '<div class="pace-bar__actual" style="width:' + (actualProgress * 100) + '%"></div>';
    html +=   '</div>';
    html +=   '<div class="pace-bar__labels">';
    html +=     '<span>按计划应该在这</span>';
    html +=     '<span>你在这</span>';
    html +=   '</div>';
    html +=   '<p class="pace-bar__comment">' + escapeHtml(paceComment);
    if (pace !== 'green') {
      html += ' <button class="pace-bar__adjust" id="pace-adjust-btn" type="button">要不要把截止日期往后挪挪？</button>';
    }
    html += '</p>';
    html += '</div>';
  }

  // ---- 逃生口 ----
  if (isFarBehind && !goal.completed && (goal.type === 'cumulative' || goal.type === 'value')) {
    var suggestTarget = Math.round((goal.target || 100) * 0.6);
    html += '<div class="escape-hatch">';
    html +=   '<p class="escape-hatch__text">要不把目标调小一点？' + (goal.target || 100) + '改成' + suggestTarget + '也是赢</p>';
    html +=   '<button class="btn btn--ghost btn--small" id="escape-adjust-btn" type="button">一键调整</button>';
    html += '</div>';
  }

  // ---- 类型专属区 ----
  if (goal.type === 'habit' && !goal.completed && !goal.paused) {
    // 习惯型：本周圆点
    var weekCheckins = getWeekCheckinCount(goal);
    var weeklyTarget = goal.weeklyTarget || 3;
    var dotsHTML = '';
    for (var d = 0; d < 7; d++) {
      var isDone = d < weekCheckins;
      dotsHTML += '<span class="habit-dot ' + (isDone ? 'habit-dot--done' : '') + '"></span>';
    }
    var remaining = Math.max(0, weeklyTarget - weekCheckins);
    html += '<div class="habit-weekly">';
    html +=   '<div class="habit-weekly__dots">' + dotsHTML + '</div>';
    html +=   '<p class="habit-weekly__text">' + (remaining > 0 ? '这周还差' + remaining + '次' : '这周已达标，稳') + '</p>';
    html += '</div>';
  }

  // ---- 里程碑勾选清单 ----
  if (goal.type === 'milestone' && goal.milestones) {
    html += '<h3 class="section-title" style="margin-top:var(--s-6)">里程碑</h3><div class="milestone-list">';
    goal.milestones.forEach(function(m, i) {
      html += '<div class="milestone-item' + (m.done ? ' done' : '') + '" data-ms-idx="' + i + '" role="button" tabindex="0">';
      html +=   '<div class="milestone-check"></div>';
      html +=   '<span class="milestone-label">' + escapeHtml(m.label) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ---- 打卡区域 ----
  if (!goal.completed && !goal.paused) {
    if (goal.type !== 'milestone') {
      var quickBtns = calcQuickButtons(goal);
      html += '<h3 class="section-title" style="margin-top:var(--s-6)">' + (goal.type === 'value' ? '录入当前值' : '快捷打卡') + '</h3>';
      html += '<div class="checkin-area">';

      if (goal.type === 'value') {
        // 数值型：录入当前值
        html += '<div class="field" style="flex:1"><span class="field__label">当前值</span><input type="number" id="checkin-amount" class="field__input" value="' + (goal.currentValue||0) + '" step="any"></div>';
        html += '<button class="btn btn--primary" id="checkin-btn" type="button">记录</button>';
      } else {
        // 累计型/习惯型：快捷按钮
        quickBtns.forEach(function(amt) {
          var display = goal.type === 'habit' ? '+1次' : '+' + amt;
          html += '<button class="btn btn--primary btn--small checkin-quick" data-amount="' + amt + '" type="button">' + display + '</button>';
        });
        html += '<div class="field" style="flex:1;max-width:120px"><span class="field__label">自定义</span><input type="number" id="checkin-amount" class="field__input" value="1" min="0" step="any"></div>';
        html += '<button class="btn btn--primary btn--small" id="checkin-btn" type="button">打卡</button>';
      }

      html += '</div>';

      // 打卡备注 + 状态标签
      html += '<div class="checkin-tags">';
      html +=   '<button class="checkin-tag" data-tag="好" type="button">状态好</button>';
      html +=   '<button class="checkin-tag" data-tag="一般" type="button">一般</button>';
      html +=   '<button class="checkin-tag" data-tag="硬撑" type="button">硬撑</button>';
      html += '</div>';

      // 动态打卡字段（规则2）
      if (goal.fields && goal.fields.length > 0) {
        html += '<div class="checkin-extras" id="checkin-extras">';
        goal.fields.forEach(function(f, fi) {
          html += '<div class="checkin-extra-field" data-field-idx="' + fi + '">';
          html +=   '<span class="checkin-extra-field__label">' + escapeHtml(f.name);
          if (f.type === 'number' && f.unit) html += '<span class="checkin-extra-field__unit">(' + escapeHtml(f.unit) + ')</span>';
          html +=   '</span>';
          if (f.type === 'number') {
            html += '<input type="number" class="field__input checkin-extra-input" data-field-id="' + f.id + '" placeholder="选填" step="any">';
          } else if (f.type === 'choice') {
            html += '<div class="checkin-extra-options">';
            (f.options || []).forEach(function(opt) {
              html += '<button type="button" class="checkin-extra-option" data-field-id="' + f.id + '" data-value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
            });
            html += '</div>';
          } else {
            html += '<input type="text" class="field__input checkin-extra-input" data-field-id="' + f.id + '" placeholder="选填">';
          }
          html += '</div>';
        });
        html += '</div>';
      }

      // 补录日期 + 备注
      var minDate = new Date(); minDate.setDate(minDate.getDate() - 7);
      html += '<div class="field" style="margin-bottom:var(--s-4)"><span class="field__label">打卡日期</span><input type="date" id="checkin-date" class="field__input" value="' + todayKey() + '" min="' + formatDate(minDate.toISOString()) + '" max="' + todayKey() + '"></div>';
      html += '<div class="field" style="margin-bottom:var(--s-3)"><span class="field__label">一句话备注</span><input type="text" id="checkin-note" class="field__input" placeholder="今天的情况…"></div>';
      html += '<label class="checkin-sync-toggle"><input type="checkbox" id="checkin-sync-daily"><span>同步到每日一句</span></label>';
    }
  } else if (goal.completed) {
    html += '<p class="empty-hint">该目标已完成 🎉</p>';
  } else if (goal.paused) {
    html += '<p class="empty-hint">这个目标在休息，随时可以恢复</p>';
  }

  // ---- 已逾期未完成：三个选择 ----
  var isOverdue = false;
  if (!goal.completed && !goal.paused && goal.deadline) {
    var overdueCheck = calcCountdown(goal.deadline);
    if (overdueCheck.overdue) isOverdue = true;
  }

  if (isOverdue && (goal.type === 'cumulative' || goal.type === 'value')) {
    html += '<h3 class="section-title">达成概率</h3>';
    html += '<div class="sandbox-overdue">';
    html +=   '<p class="sandbox-overdue__text">已逾期——延期、拆分、还是放弃？三个都是合法选择</p>';
    html +=   '<div class="sandbox-overdue__actions">';
    html +=     '<button class="btn btn--primary btn--small" id="overdue-extend-btn" type="button">延期</button>';
    html +=     '<button class="btn btn--ghost btn--small" id="overdue-split-btn" type="button">拆分</button>';
    html +=     '<button class="btn btn--danger-weak" id="overdue-abandon-btn" type="button">放弃</button>';
    html +=   '</div>';
    html += '</div>';
  } else if (!goal.completed && !goal.paused && (goal.type === 'cumulative' || goal.type === 'value')) {
    // ---- 达成概率 · 决策沙盘 ----
    html += '<div id="sandbox-slot"></div>';
  }

  // ---- 训练日志（有内容字段的目标才显示）----
  if (goal.fields && goal.fields.length > 0 && goal.checkins && goal.checkins.length > 0) {
    var logCheckins = goal.checkins.filter(function(c) { return c.extras; });
    if (logCheckins.length > 0) {
      html += '<h3 class="section-title" style="margin-top:var(--s-6)">训练日志</h3>';
      html += '<div class="training-log">';
      logCheckins.slice().reverse().forEach(function(c) {
        html += '<div class="training-log__item">';
        html +=   '<div class="training-log__time">' + (c.date || '') + (c.time ? ' ' + c.time : '') + '</div>';
        if (c.note) html += '<p style="font-size:13px;color:var(--t-1);margin-bottom:var(--s-1)">' + escapeHtml(c.note) + '</p>';
        // 显示 extras
        html += '<div class="training-log__extras">';
        goal.fields.forEach(function(f) {
          if (c.extras && c.extras[f.id] !== undefined && c.extras[f.id] !== null && c.extras[f.id] !== '') {
            var val = c.extras[f.id];
            var text = f.name + ': ' + val;
            if (f.type === 'number' && f.unit) text += f.unit;
            html += '<span class="training-log__extra-tag">' + escapeHtml(text) + '</span>';
          }
        });
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';

      // ---- 内容统计（规则5）----
      html += '<h3 class="section-title" style="margin-top:var(--s-6)">内容统计</h3>';
      html += '<div class="content-stats">';
      var cutoff30 = new Date();
      cutoff30.setDate(cutoff30.getDate() - 30);

      goal.fields.forEach(function(f) {
        if (f.type === 'number') {
          var values = [];
          goal.checkins.forEach(function(c) {
            if (c.extras && c.extras[f.id] !== undefined && c.extras[f.id] !== null) {
              var d = new Date(c.date);
              if (d >= cutoff30) {
                values.push({ date: c.date, val: parseFloat(c.extras[f.id]) || 0 });
              }
            }
          });
          var total = values.reduce(function(s, v) { return s + v.val; }, 0);
          html += '<div class="content-stat__row">';
          html +=   '<span class="content-stat__label">' + escapeHtml(f.name) + '</span>';
          html +=   '<span class="content-stat__value">' + total + (f.unit ? ' ' + escapeHtml(f.unit) : '') + '</span>';
          html += '</div>';
          if (values.length >= 2) {
            html += '<div class="content-stat__trend">' + renderMiniSparkline(values) + '</div>';
          }
        } else if (f.type === 'choice') {
          var dist = {};
          goal.checkins.forEach(function(c) {
            if (c.extras && c.extras[f.id]) {
              dist[c.extras[f.id]] = (dist[c.extras[f.id]] || 0) + 1;
            }
          });
          var totalChoices = Object.keys(dist).reduce(function(s, k) { return s + dist[k]; }, 0);
          if (totalChoices > 0) {
            var colors = ['#38bdf8', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24', '#fb923c', '#f87171'];
            html += '<div class="content-stat__row">';
            html +=   '<span class="content-stat__label">' + escapeHtml(f.name) + ' 分布</span>';
            html += '</div>';
            html += '<div class="content-stat__bar">';
            var ci = 0;
            Object.keys(dist).forEach(function(key) {
              var pct = (dist[key] / totalChoices * 100).toFixed(0);
              var color = colors[ci % colors.length];
              html += '<div class="content-stat__bar-segment" style="width:' + pct + '%;background:' + color + '"></div>';
              ci++;
            });
            html += '</div>';
            html += '<div class="content-stat__legend">';
            ci = 0;
            Object.keys(dist).forEach(function(key) {
              var color = colors[ci % colors.length];
              html += '<span><span class="content-stat__legend-dot" style="background:' + color + '"></span>' + escapeHtml(key) + ' ' + dist[key] + '</span>';
              ci++;
            });
            html += '</div>';
          }
        }
      });
      html += '</div>';
    }
  }

  // ---- 趋势图 ----
  html += '<h3 class="section-title">近30天趋势</h3>';
  if (goal.checkins && goal.checkins.length > 0) {
    html += '<div class="chart-wrap"><canvas id="trend-canvas"></canvas></div>';
  } else {
    html += '<p class="empty-hint" style="padding:var(--s-6) 0">暂无打卡数据，开始打卡后这里会显示趋势图</p>';
  }

  // ---- 打卡历史 ----
  if (goal.checkins && goal.checkins.length > 0) {
    html += '<h3 class="section-title">打卡记录</h3><div class="checkin-history">';
    goal.checkins.slice().reverse().forEach(function(c, i) {
      var realIdx = goal.checkins.length - 1 - i;
      var amountText = '';
      if (goal.type === 'value') {
        amountText = '记录值: ' + (c.cumulative !== undefined ? c.cumulative : c.amount);
      } else if (c.amount) {
        amountText = '+' + c.amount;
      }
      var tagBadge = c.tag ? '<span class="log-item__tag log-item__tag--' + c.tag + '">' + c.tag + '</span>' : '';
      // extras 标签
      var extrasHTML = '';
      if (c.extras && goal.fields) {
        goal.fields.forEach(function(f) {
          if (c.extras[f.id] !== undefined && c.extras[f.id] !== null && c.extras[f.id] !== '') {
            var val = c.extras[f.id];
            var text = f.name + ': ' + val;
            if (f.type === 'number' && f.unit) text += f.unit;
            extrasHTML += '<span class="log-item__tag">' + escapeHtml(text) + '</span>';
          }
        });
      }
      html += '<div class="log-item">' +
        '<div class="log-item__main">' +
          '<span class="log-item__time">' + (c.date || '') + (c.time ? ' ' + c.time : '') + '</span>' +
          (amountText ? '<span class="log-item__amount">' + escapeHtml(amountText) + '</span>' : '') +
          tagBadge +
          extrasHTML +
          (c.note ? '<p class="log-item__content">' + escapeHtml(c.note) + '</p>' : '') +
        '</div>' +
        '<button class="log-item__del" data-checkin-idx="' + realIdx + '" type="button">删除</button>' +
      '</div>';
    });
    html += '</div>';
  }

  // ---- 删除目标按钮 ----
  html += '<div style="margin-top:var(--s-12);padding-top:var(--s-6);border-top:1px solid var(--border)">';
  html +=   '<button class="btn btn--ghost btn--danger-weak" id="goal-delete-btn" type="button">删除此目标</button>';
  html += '</div>';

  content.innerHTML = html;
  modal.hidden = false;
  trapFocus(modal);

  // ---- 状态标签选择 ----
  var selectedTag = '';
  content.querySelectorAll('.checkin-tag').forEach(function(tag) {
    tag.addEventListener('click', function() {
      content.querySelectorAll('.checkin-tag').forEach(function(t) { t.classList.remove('checkin-tag--active'); });
      tag.classList.add('checkin-tag--active');
      selectedTag = tag.dataset.tag;
    });
  });

  // ---- 动态字段单选按钮 ----
  var selectedExtras = {}; // { fieldId: value }
  content.querySelectorAll('.checkin-extra-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      var fid = opt.dataset.fieldId;
      var val = opt.dataset.value;
      var siblings = content.querySelectorAll('.checkin-extra-option[data-field-id="' + fid + '"]');
      if (selectedExtras[fid] === val) {
        // 再次点击取消选择
        delete selectedExtras[fid];
        opt.classList.remove('checkin-extra-option--active');
      } else {
        siblings.forEach(function(s) { s.classList.remove('checkin-extra-option--active'); });
        opt.classList.add('checkin-extra-option--active');
        selectedExtras[fid] = val;
      }
    });
  });

  function collectExtras() {
    var extras = {};
    // 收集单选型
    Object.keys(selectedExtras).forEach(function(fid) {
      extras[fid] = selectedExtras[fid];
    });
    // 收集数字型/文本型
    content.querySelectorAll('.checkin-extra-input').forEach(function(input) {
      var fid = input.dataset.fieldId;
      var val = input.value.trim();
      if (val) extras[fid] = input.type === 'number' ? parseFloat(val) : val;
    });
    return Object.keys(extras).length > 0 ? extras : null;
  }

  // ---- 编辑按钮 ----
  var editBtn = document.getElementById('goal-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function() {
      closeAnyModal(modal);
      openGoalModal(id);
    });
  }

  // ---- 暂停/恢复 ----
  var pauseBtn = document.getElementById('goal-pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function() {
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      g2.paused = true;
      saveGoals(gs2);
      openGoalDetail(id);
      renderGoals();
      showToast('目标已暂停。在休息，不是放弃', 'success');
    });
  }
  var resumeBtn = document.getElementById('goal-resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function() {
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      g2.paused = false;
      saveGoals(gs2);
      openGoalDetail(id);
      renderGoals();
      showToast('目标已恢复。欢迎回来', 'success');
    });
  }

  // ---- 节奏条调整 ----
  var paceAdjustBtn = content.querySelector('#pace-adjust-btn');
  if (paceAdjustBtn) {
    paceAdjustBtn.addEventListener('click', function() {
      closeAnyModal(modal);
      openGoalModal(id);
      showToast('在编辑中调整截止日期', 'success');
    });
  }

  // ---- 逃生口调整 ----
  var escapeBtn = content.querySelector('#escape-adjust-btn');
  if (escapeBtn) {
    escapeBtn.addEventListener('click', function() {
      var gs2 = loadGoals();
      var g2 = gs2.find(function(x) { return x.id === id; });
      var oldTarget = g2.target;
      g2.target = Math.round(oldTarget * 0.6);
      saveGoals(gs2);
      invalidateProbCache(id);
      openGoalDetail(id);
      renderGoals();
      showToast('目标从 ' + oldTarget + ' 调整到 ' + g2.target + '。换一条路，也是赢', 'success', { duration: 4000 });
    });
  }

  // ---- 删除目标 ----
  var delBtn = document.getElementById('goal-delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', function() {
      confirmDelete('删除目标', '确定删除「' + goal.name + '」？此操作不可撤销。', function() {
        var deletedGoal = JSON.parse(JSON.stringify(goal));
        var goalsBefore = loadGoals();
        saveGoals(goalsBefore.filter(function(g) { return g.id !== id; }));
        closeAnyModal(modal);
        renderGoals();
        showToast('目标已删除', 'success', {
          undo: function() {
            var goalsAfter = loadGoals();
            goalsAfter.push(deletedGoal);
            saveGoals(goalsAfter);
            renderGoals();
          }
        });
      });
    });
  }

  // ---- 里程碑切换 ----
  content.querySelectorAll('.milestone-item').forEach(function(el) {
    var toggleMs = function() {
      var idx = parseInt(el.dataset.msIdx);
      var goals2 = loadGoals();
      var g2 = goals2.find(function(g) { return g.id === id; });
      var wasDone = g2.milestones[idx].done;
      g2.milestones[idx].done = !wasDone;
      g2.currentValue = g2.milestones.filter(function(m) { return m.done; }).length;
      if (g2.currentValue >= g2.target && g2.target > 0 && !g2.completed) {
        g2.completed = true;
        g2.completedDate = new Date().toISOString();
        addTimelineFromGoal(g2);
        saveGoals(goals2);
        showCompletionRitual(g2);
        openGoalDetail(id);
        renderGoals();
      } else {
        // 里程碑勾选小撒花
        if (!wasDone) {
          launchMiniConfetti(el);
        }
        saveGoals(goals2);
        openGoalDetail(id);
        renderGoals();
      }
    };
    el.addEventListener('click', function(e) { e.preventDefault(); toggleMs(); });
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMs(); }
    });
  });

  // ---- 快捷打卡按钮 ----
  content.querySelectorAll('.checkin-quick').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var amount = parseFloat(btn.dataset.amount) || 0;
      var noteEl = document.getElementById('checkin-note');
      var dateEl = document.getElementById('checkin-date');
      var syncEl = document.getElementById('checkin-sync-daily');
      var note = noteEl ? noteEl.value.trim() : '';
      var date = dateEl ? dateEl.value : todayKey();
      var tag = selectedTag || '';
      var syncDaily = syncEl ? syncEl.checked : false;
      var extras = collectExtras();
      doCheckin(id, amount, note, date, tag, syncDaily, extras);
      selectedTag = '';
      selectedExtras = {};
    });
  });

  // ---- 自定义打卡 / 数值型记录 ----
  var checkinBtn = document.getElementById('checkin-btn');
  if (checkinBtn) {
    checkinBtn.addEventListener('click', function() {
      var amountEl = document.getElementById('checkin-amount');
      var noteEl = document.getElementById('checkin-note');
      var dateEl = document.getElementById('checkin-date');
      var syncEl = document.getElementById('checkin-sync-daily');
      var note = noteEl ? noteEl.value.trim() : '';
      var date = dateEl ? dateEl.value : todayKey();
      var tag = selectedTag || '';
      var syncDaily = syncEl ? syncEl.checked : false;
      var extras = collectExtras();

      if (goal.type === 'value') {
        var newVal = parseFloat(amountEl.value) || 0;
        doValueCheckin(id, newVal, note, date, tag, syncDaily, extras);
      } else {
        var amount = parseFloat(amountEl.value) || 0;
        doCheckin(id, amount, note, date, tag, syncDaily, extras);
      }
      selectedTag = '';
      selectedExtras = {};
    });
  }

  // ---- 打卡历史删除 ----
  content.querySelectorAll('.log-item__del').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(el.dataset.checkinIdx);
      confirmDelete('删除打卡记录', '确定删除这条打卡记录？', function() {
        var goals2 = loadGoals();
        var g2 = goals2.find(function(g) { return g.id === id; });
        if (!g2.checkins || idx < 0 || idx >= g2.checkins.length) return;

        var deleted = g2.checkins[idx];
        if (g2.type === 'value') {
          if (idx > 0) {
            g2.currentValue = g2.checkins[idx - 1].cumulative !== undefined ? g2.checkins[idx - 1].cumulative : g2.startVal;
          } else {
            g2.currentValue = g2.startVal;
          }
        } else if (g2.type !== 'milestone') {
          g2.currentValue = (g2.currentValue || 0) - (deleted.amount || 0);
          if (g2.currentValue < 0) g2.currentValue = 0;
        }
        g2.checkins.splice(idx, 1);

        if (g2.type === 'value') {
          var cum = g2.startVal;
          g2.checkins.forEach(function(c) {
            cum = c.cumulative !== undefined ? c.cumulative : cum;
          });
          g2.currentValue = cum;
        }

        if (g2.completed && calcProgress(g2) < 1) {
          g2.completed = false;
          g2.completedDate = null;
        }

        saveGoals(goals2);
        openGoalDetail(id);
        renderGoals();
        showToast('打卡记录已删除', 'success');
      });
    });
  });

  // ---- 已逾期快捷按钮 ----
  var overdueExtend = content.querySelector('#overdue-extend-btn');
  if (overdueExtend) {
    overdueExtend.addEventListener('click', function() {
      var goals2 = loadGoals();
      var g2 = goals2.find(function(x) { return x.id === id; });
      if (!g2) return;
      var newDeadline = new Date();
      newDeadline.setDate(newDeadline.getDate() + 30);
      g2.deadline = formatDate(newDeadline.toISOString());
      saveGoals(goals2);
      invalidateProbCache(id);
      openGoalDetail(id);
      renderGoals();
      showToast('已延期30天', 'success');
    });
  }

  var overdueSplit = content.querySelector('#overdue-split-btn');
  if (overdueSplit) {
    overdueSplit.addEventListener('click', function() {
      closeAnyModal(document.getElementById('goal-detail-modal'));
      openGoalModal(id);
      showToast('在编辑中调整目标值或截止日期', 'success');
    });
  }

  var overdueAbandon = content.querySelector('#overdue-abandon-btn');
  if (overdueAbandon) {
    overdueAbandon.addEventListener('click', function() {
      confirmDelete('放弃目标', '确定放弃「' + goal.name + '」？这个目标会被删除。', function() {
        saveGoals(loadGoals().filter(function(g) { return g.id !== id; }));
        closeAnyModal(document.getElementById('goal-detail-modal'));
        renderGoals();
        showToast('目标已放弃。放下也是一种智慧。', 'success');
      });
    });
  }

  // ---- 决策沙盘异步计算 ----
  var sandboxSlot = content.querySelector('#sandbox-slot');
  if (sandboxSlot) {
    sandboxSlot.innerHTML = '<h3 class="section-title">达成概率</h3>' +
      '<div class="sandbox-section sandbox-section--loading">' +
        '<p class="sandbox-loading">计算中…</p>' +
      '</div>';
    var sandboxGoalId = id;
    setTimeout(function() {
      var goals3 = loadGoals();
      var g3 = goals3.find(function(x) { return x.id === sandboxGoalId; });
      if (!g3) return;
      var slot = document.querySelector('#sandbox-slot');
      if (!slot) return;

      var sbResult = getCachedSandbox(g3);
      if (sbResult) {
        slot.innerHTML = renderDecisionSandbox(g3, sbResult);
        bindDecisionSandbox(document.getElementById('goal-detail-modal'), g3);
        if (isFirstUnlock(sandboxGoalId, g3)) {
          setTimeout(function() {
            markProbUnlocked(sandboxGoalId);
            showProbUnlockCard(sandboxGoalId);
          }, 600);
        }
      } else {
        var poolData = buildDailyPool(g3);
        if (poolData && poolData.length < 14 && poolData.length > 0) {
          slot.innerHTML = '<h3 class="section-title">达成概率</h3>' +
            '<div class="sandbox-section sandbox-section--locked">' +
              '<div class="sandbox-locked">' +
                '<div class="sandbox-locked__icon">🔒</div>' +
                '<p class="sandbox-locked__text">再记几天，我就能告诉你胜算有多大</p>' +
                '<p class="sandbox-locked__sub">连续记录14天（两个生活节奏周期），概率才会准</p>' +
              '</div>' +
            '</div>';
        } else {
          slot.innerHTML = '';
        }
      }
    }, 0);
  }

  // ---- 趋势图 ----
  if (goal.checkins && goal.checkins.length > 0) {
    drawTrendChart(goal);
  }
}

// ---- 本周打卡次数 ----
function getWeekCheckinCount(goal) {
  var weekStart = getWeekStart();
  var count = 0;
  (goal.checkins || []).forEach(function(c) {
    if (c.date >= weekStart) count++;
  });
  return count;
}

// ---- 迷你撒花（里程碑勾选）----
function launchMiniConfetti(el) {
  if (!el) return;
  var rect = el.getBoundingClientRect();
  var container = document.createElement('div');
  container.className = 'confetti confetti--mini';
  container.style.position = 'fixed';
  container.style.left = rect.left + 'px';
  container.style.top = rect.top + 'px';
  container.style.width = rect.width + 'px';
  container.style.height = rect.height + 'px';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '400';

  var colors = ['#4ade80', '#fbbf24', '#38bdf8'];
  for (var i = 0; i < 12; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti__piece';
    piece.style.left = (30 + Math.random() * 40) + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    piece.style.width = '4px';
    piece.style.height = '4px';
    piece.style.borderRadius = '50%';
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(function() { container.remove(); }, 2000);
}

// 打卡回应文案（按标签分化）
var CHECKIN_RESPONSES = {
  '好': '趁这股劲，明天见',
  '一般': '一般的日子也在往前推你',
  '硬撑': '硬撑也算数，而且更算数',
  '': null, // 无标签时用随机鼓励
};

// 执行打卡（累计型/习惯型）— 支持补录 + 状态标签 + 同步每日一句
function doCheckin(goalId, amount, note, checkinDate, tag, syncDaily, extras) {
  if (amount <= 0) {
    showToast('打卡量必须大于0', 'warning');
    return;
  }
  var goals = loadGoals();
  var g = goals.find(function(gg) { return gg.id === goalId; });
  if (!g || g.completed || g.paused) return;

  // 断卡回归检测
  var lastDate = getLastCheckinDate(g);
  var isReturn = lastDate && daysBetween(lastDate, todayKey()) >= 3;

  var oldProb = getCachedSandbox(g);
  var oldProbVal = oldProb ? oldProb.probability : null;

  var now = new Date();
  var date = checkinDate || todayKey();
  if (date !== todayKey()) {
    var diff = daysBetween(date, todayKey());
    if (diff > 7) {
      showToast('最多只能补录7天内的打卡', 'warning');
      return;
    }
  }
  var checkin = {
    date: date,
    time: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    amount: amount,
    note: note,
    tag: tag || '',
    extras: extras || null,
  };
  if (!g.checkins) g.checkins = [];
  g.checkins.push(checkin);
  g.currentValue = (g.currentValue || 0) + amount;

  // 成就检测
  var achievements = checkAchievements(g);

  var justCompleted = false;
  if (g.type !== 'milestone' && g.target > 0 && g.currentValue >= g.target && !g.completed) {
    g.completed = true;
    g.completedDate = new Date().toISOString();
    addTimelineFromGoal(g);
    justCompleted = true;
  }

  // 同步到每日一句
  if (syncDaily && note) {
    var daily = loadJSON(STORAGE_DAILY, []);
    daily.push({ id: uuid(), date: date, text: note });
    saveJSON(STORAGE_DAILY, daily);
  }

  saveGoals(goals);
  invalidateProbCache(goalId);

  // 同行者：推送进度到云端（离线优先，失败自动入队）
  syncToCloud(goalId);

  openGoalDetail(goalId);
  renderGoals();

  // 回应逻辑
  if (justCompleted) {
    showCompletionRitual(g);
  } else if (isReturn) {
    showToast('欢迎回来。中断是人之常情，回来就是本事', 'success', {
      duration: 4000,
      undo: function() {
        var gs2 = loadGoals();
        var g2 = gs2.find(function(x) { return x.id === goalId; });
        if (g2 && g2.checkins && g2.checkins.length > 0) {
          var last = g2.checkins[g2.checkins.length - 1];
          g2.currentValue = (g2.currentValue || 0) - (last.amount || 0);
          if (g2.currentValue < 0) g2.currentValue = 0;
          if (g2.completed && calcProgress(g2) < 1) {
            g2.completed = false;
            g2.completedDate = null;
          }
          g2.checkins.pop();
          saveGoals(gs2);
          invalidateProbCache(goalId);
          openGoalDetail(goalId);
          renderGoals();
        }
      }
    });
  } else if (achievements.length > 0) {
    showToast(achievements[0].text, 'success', { duration: 4000 });
  } else {
    // 按标签分化回应
    var response = CHECKIN_RESPONSES[tag || ''];
    var toastText = response || randomEncourage();
    showToast('+' + amount + '。' + toastText, 'success', {
      undo: function() {
        var gs2 = loadGoals();
        var g2 = gs2.find(function(x) { return x.id === goalId; });
        if (g2 && g2.checkins && g2.checkins.length > 0) {
          var last = g2.checkins[g2.checkins.length - 1];
          g2.currentValue = (g2.currentValue || 0) - (last.amount || 0);
          if (g2.currentValue < 0) g2.currentValue = 0;
          if (g2.completed && calcProgress(g2) < 1) {
            g2.completed = false;
            g2.completedDate = null;
          }
          g2.checkins.pop();
          saveGoals(gs2);
          invalidateProbCache(goalId);
          openGoalDetail(goalId);
          renderGoals();
        }
      }
    });
  }

  // 概率变动 Toast
  setTimeout(function() {
    var newSandbox = getCachedSandbox(g);
    var newProbVal = newSandbox ? newSandbox.probability : null;
    if (oldProbVal !== null && newProbVal !== null && Math.abs(newProbVal - oldProbVal) > 15) {
      showToast('概率变化较大（' + oldProbVal + '% → ' + newProbVal + '%），近期数据密度变了', 'warning', { duration: 4000 });
    }
  }, 100);
}

// 数值型打卡 — 录入当前值
function doValueCheckin(goalId, newVal, note, checkinDate, tag, syncDaily, extras) {
  var goals = loadGoals();
  var g = goals.find(function(gg) { return gg.id === goalId; });
  if (!g || g.completed || g.paused) return;

  var oldProb = getCachedSandbox(g);
  var oldProbVal = oldProb ? oldProb.probability : null;

  var now = new Date();
  var date = checkinDate || todayKey();
  if (date !== todayKey()) {
    var diff = daysBetween(date, todayKey());
    if (diff > 7) {
      showToast('最多只能补录7天内的打卡', 'warning');
      return;
    }
  }
  var checkin = {
    date: date,
    time: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    amount: 0,
    cumulative: newVal,
    note: note,
    tag: tag || '',
    extras: extras || null,
  };
  if (!g.checkins) g.checkins = [];
  g.checkins.push(checkin);
  g.currentValue = newVal;

  var justCompleted = false;
  if (!g.completed) {
    var total = g.target - g.startVal;
    var did = newVal - g.startVal;
    var p = total < 0 ? -did / -total : did / total;
    if (p >= 1) {
      g.completed = true;
      g.completedDate = new Date().toISOString();
      addTimelineFromGoal(g);
      justCompleted = true;
    }
  }

  // 新高/新低检测
  var isNewRecord = false;
  var recordText = '';
  if (g.checkins.length >= 2) {
    var prevVals = g.checkins.slice(0, -1).map(function(c) { return c.cumulative || 0; });
    var prevMax = Math.max.apply(null, prevVals);
    var prevMin = Math.min.apply(null, prevVals);
    if (newVal > prevMax) { isNewRecord = true; recordText = '新纪录！'; }
    if (newVal < prevMin) { isNewRecord = true; recordText = '新低记录'; }
  }

  // 同步到每日一句
  if (syncDaily && note) {
    var daily = loadJSON(STORAGE_DAILY, []);
    daily.push({ id: uuid(), date: date, text: note });
    saveJSON(STORAGE_DAILY, daily);
  }

  saveGoals(goals);
  invalidateProbCache(goalId);

  openGoalDetail(goalId);
  renderGoals();

  if (justCompleted) {
    showCompletionRitual(g);
  } else if (isNewRecord) {
    showToast(recordText + ' 已记录当前值: ' + newVal, 'success', { duration: 4000 });
  } else {
    var response = CHECKIN_RESPONSES[tag || ''];
    var toastText = response || '已记录当前值: ' + newVal;
    showToast(toastText, 'success');
  }

  setTimeout(function() {
    var newSandbox = getCachedSandbox(g);
    var newProbVal = newSandbox ? newSandbox.probability : null;
    if (oldProbVal !== null && newProbVal !== null && Math.abs(newProbVal - oldProbVal) > 15) {
      showToast('概率变化较大（' + oldProbVal + '% → ' + newProbVal + '%），近期数据密度变了', 'warning', { duration: 4000 });
    }
  }, 100);
}

// ============================================================
// 达成概率 · 决策沙盘 — 加权经验 bootstrap
// ============================================================

var STORAGE_PROB_UNLOCK = 'lifeos_prob_unlocked';
var _probCache = {}; // goalId -> { result, ts }
var _probCacheCheckinCount = {}; // goalId -> checkin count at last calc

// 构建日进度池：从首条记录日到今天，连续日历日，缺记录补0，上限30天
function buildDailyPool(goal) {
  var checkins = goal.checkins || [];
  if (checkins.length === 0) return null;

  // 按日期排序
  var sorted = checkins.slice().sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '');
  });

  var firstDate = new Date(sorted[0].date);
  firstDate.setHours(0, 0, 0, 0);

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // 上限30天
  var maxDays = 30;
  var totalCalendarDays = Math.ceil((today - firstDate) / 86400000) + 1;

  // 如果首条记录距今超过30天，只取最近30天
  var startDate;
  if (totalCalendarDays > maxDays) {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (maxDays - 1));
  } else {
    startDate = firstDate;
  }

  var poolLength = Math.ceil((today - startDate) / 86400000) + 1;
  if (poolLength > maxDays) poolLength = maxDays;
  if (poolLength < 1) return null;

  // 方向统一：数值型减重取当日下降量（正方向）
  var direction = 1; // 1=递增目标，-1=递减目标
  if (goal.type === 'value') {
    if (goal.target < (goal.startVal || 0)) direction = -1;
  }

  // 按日期聚合每日进度
  var dailyProgress = {}; // dateKey -> progress (朝目标方向的正值)
  var prevValue = goal.startVal || 0;

  if (goal.type === 'value') {
    // 数值型：日进度 = |当日值 - 昨日值| × 方向修正
    var valueByDate = {};
    sorted.forEach(function(c) {
      var d = c.date;
      var val = c.cumulative !== undefined ? c.cumulative : prevValue;
      // 同一天取最后一条
      valueByDate[d] = val;
    });

    var dateKeys = Object.keys(valueByDate).sort();
    var runningPrev = goal.startVal || 0;
    dateKeys.forEach(function(dk) {
      var val = valueByDate[dk];
      var change = (val - runningPrev) * direction;
      dailyProgress[dk] = Math.max(0, change); // 只取朝目标方向的进度
      runningPrev = val;
    });
  } else {
    // 累计型：日进度 = amount
    sorted.forEach(function(c) {
      if (!c.date) return;
      var amt = c.amount || 0;
      if (amt > 0) {
        if (!dailyProgress[c.date]) dailyProgress[c.date] = 0;
        dailyProgress[c.date] += amt;
      }
    });
  }

  // 构建连续日历日数组
  var pool = []; // [{ dateKey, progress, age }]
  for (var i = 0; i < poolLength; i++) {
    var d = new Date(startDate);
    d.setDate(d.getDate() + i);
    var dk = formatDate(d.toISOString());
    var progress = dailyProgress[dk] || 0; // 缺记录补0
    var age = Math.ceil((today - d) / 86400000); // 0=今天
    pool.push({ dateKey: dk, progress: progress, age: age });
  }

  return { pool: pool, length: poolLength };
}

// 加权经验 bootstrap 模拟
function runBootstrap(pool, currentValue, target, remainingDays, direction, simulations) {
  simulations = simulations || 1000;
  var n = pool.length;
  if (n === 0) return null;

  // 计算加权权重
  var weights = [];
  var totalWeight = 0;
  for (var i = 0; i < n; i++) {
    var w = Math.pow(2, -pool[i].age / 14);
    weights.push(w);
    totalWeight += w;
  }
  // 归一化 → 累积分布
  var cumWeights = [];
  var cum = 0;
  for (var i = 0; i < n; i++) {
    cum += weights[i] / totalWeight;
    cumWeights.push(cum);
  }

  // 有放回抽样函数
  function weightedSample() {
    var r = Math.random();
    // 二分查找
    var lo = 0, hi = n - 1;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (cumWeights[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return pool[lo].progress;
  }

  var successCount = 0;
  var completionDays = [];

  for (var sim = 0; sim < simulations; sim++) {
    var val = currentValue;
    var done = false;

    for (var day = 0; day < remainingDays; day++) {
      var inc = weightedSample();
      val += inc * direction;

      var achieved = false;
      if (direction > 0) {
        achieved = val >= target;
      } else {
        achieved = val <= target;
      }

      if (achieved) {
        successCount++;
        completionDays.push(day + 1);
        done = true;
        break;
      }
    }
  }

  var probability = Math.round((successCount / simulations) * 100);

  // 完成时间：25%~75% 分位区间
  var completionRange = null;
  if (completionDays.length > 0) {
    completionDays.sort(function(a, b) { return a - b; });
    var q25Idx = Math.floor(completionDays.length * 0.25);
    var q75Idx = Math.floor(completionDays.length * 0.75);
    var q25 = completionDays[q25Idx];
    var q75 = completionDays[q75Idx];
    completionRange = { q25: q25, q75: q75 };
  }

  return {
    probability: probability,
    completionRange: completionRange,
    successCount: successCount,
    totalSims: simulations,
    allFailed: successCount === 0,
  };
}

// 计算日均
function calcAvg(pool, days) {
  if (!pool || pool.length === 0) return 0;
  var recent = pool.slice(-Math.min(days, pool.length));
  var sum = 0;
  recent.forEach(function(p) { sum += p.progress; });
  return sum / recent.length;
}

// 主函数：决策沙盘
function calcDecisionSandbox(goal) {
  if (goal.completed) return null;
  if (goal.type !== 'cumulative' && goal.type !== 'value') return null;

  var checkins = goal.checkins || [];
  if (checkins.length === 0) return null;

  var data = buildDailyPool(goal);
  if (!data) return null;
  if (data.length < 14) return null; // 池长<14天不显示

  var pool = data.pool;
  var poolLength = data.length;

  // 方向
  var direction = 1;
  if (goal.type === 'value' && goal.target < (goal.startVal || 0)) direction = -1;

  // 当前值 & 目标值
  var currentValue = goal.currentValue || 0;
  var target = goal.target;

  // 剩余量
  var remaining;
  if (direction > 0) {
    remaining = target - currentValue;
  } else {
    remaining = currentValue - target;
  }
  if (remaining <= 0) return null;

  // 模拟天数
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var endDate;
  if (goal.deadline) {
    endDate = new Date(goal.deadline);
  } else {
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 90); // 无截止日期90天封顶
  }
  endDate.setHours(0, 0, 0, 0);

  var remainingDays = Math.ceil((endDate - today) / 86400000);
  if (remainingDays <= 0) return null;

  // 主模拟
  var mainResult = runBootstrap(pool, currentValue, target, remainingDays, direction, 1000);
  if (!mainResult) return null;

  // 概率三档
  var level = 'green';
  var levelText = '维持即可';
  if (mainResult.probability < 40) {
    level = 'red';
    levelText = '需结构性调整';
  } else if (mainResult.probability < 75) {
    level = 'yellow';
    levelText = '需要干预';
  }

  // 完成时间区间
  var completionText = '';
  if (mainResult.allFailed) {
    if (!goal.deadline) {
      completionText = '按当前惯性，90天内难以达成';
    } else {
      completionText = '按当前惯性，难以在截止日期前达成';
    }
  } else if (mainResult.completionRange) {
    var r = mainResult.completionRange;
    var d25 = new Date(today);
    d25.setDate(d25.getDate() + r.q25);
    var d75 = new Date(today);
    d75.setDate(d75.getDate() + r.q75);
    var span = r.q75 - r.q25;
    completionText = formatDate(d25.toISOString()) + ' ~ ' + formatDate(d75.toISOString()) + '，约' + span + '天窗口';
  }

  // 固定对比行
  var avg7 = calcAvg(pool, 7);
  var avg30 = calcAvg(pool, 30); // 实际取池长（最多30天）
  var compareText = '近7天日均 ' + avg7.toFixed(2) + ' vs 近30天日均 ' + avg30.toFixed(2);

  // 偏差判定
  var deviationTip = '';
  var targetAbs = Math.abs(target);
  var denominator = Math.max(Math.abs(avg30), targetAbs * 0.01);
  var deviation = Math.abs(avg7 - avg30) / denominator;
  if (deviation > 0.3) {
    if (Math.abs(avg30) < 1e-8 && avg7 > 0) {
      deviationTip = '你的引擎刚点火';
    } else {
      deviationTip = '近期节奏波动较大，注意稳定性';
    }
  }

  // 惯性断裂检测
  var inertiaBreakTip = '';
  if (avg7 > 0) {
    var pureSpeedDays = Math.ceil(remaining / avg7);
    inertiaBreakTip = '按近7天纯速度还需约' + pureSpeedDays + '天';
    if (goal.deadline) {
      if (pureSpeedDays > remainingDays * 1.5 || pureSpeedDays < remainingDays * 0.5) {
        inertiaBreakTip += '，与加权模拟差异大，警惕惯性断裂';
      }
    }
  }

  // 干预模拟
  var interventions = [];
  var currentDailyAvg = avg7 > 0 ? avg7 : avg30;

  // 截止≤7天且概率<10% → 不显示干预模拟
  var showIntervention = true;
  var interventionBlockText = '';
  if (goal.deadline && remainingDays <= 7 && mainResult.probability < 10) {
    showIntervention = false;
    interventionBlockText = '剩余时间过短，建议拆分目标或延期';
  }

  if (showIntervention) {
    if (currentDailyAvg > 0) {
      // 情景A: 每日+20%
      var poolA = pool.map(function(p) {
        return { dateKey: p.dateKey, progress: p.progress * 1.2, age: p.age };
      });
      var resultA = runBootstrap(poolA, currentValue, target, remainingDays, direction, 1000);

      // 情景B: 每日+50%
      var poolB = pool.map(function(p) {
        return { dateKey: p.dateKey, progress: p.progress * 1.5, age: p.age };
      });
      var resultB = runBootstrap(poolB, currentValue, target, remainingDays, direction, 1000);

      interventions.push({
        label: '每日+20%',
        fromProb: mainResult.probability,
        toProb: resultA.probability,
      });
      interventions.push({
        label: '每日+50%',
        fromProb: mainResult.probability,
        toProb: resultB.probability,
      });
    } else {
      // 当前日均=0 → 显示达标最低日均
      var minDaily = remaining / remainingDays;
      interventionBlockText = '从零开始的话，每天需要 ' + minDaily.toFixed(2) + ' ' + (goal.unit || '');
    }
  }

  return {
    probability: mainResult.probability,
    level: level,
    levelText: levelText,
    completionText: completionText,
    allFailed: mainResult.allFailed,
    hasDeadline: !!goal.deadline,
    remainingDays: remainingDays,
    compareText: compareText,
    deviationTip: deviationTip,
    inertiaBreakTip: inertiaBreakTip,
    showIntervention: showIntervention,
    interventionBlockText: interventionBlockText,
    interventions: interventions,
    poolLength: poolLength,
    currentDailyAvg: currentDailyAvg,
    remaining: remaining,
    unit: goal.unit || '',
  };
}

// 检查是否应该解锁概率功能
function checkProbUnlock(goal) {
  if (!goal || goal.completed) return false;
  if (goal.type !== 'cumulative' && goal.type !== 'value') return false;
  var data = buildDailyPool(goal);
  if (!data) return false;
  return data.length >= 14;
}

// 检查是否是首次解锁（当天才弹解锁卡）
function isFirstUnlock(goalId, goal) {
  if (!checkProbUnlock(goal)) return false;
  var unlocked = loadJSON(STORAGE_PROB_UNLOCK, {});
  // 如果已标记解锁且不是今天标记的，不算首次
  if (unlocked[goalId] && unlocked[goalId] !== todayKey()) return false;
  // 如果今天刚满14天且未标记过
  if (!unlocked[goalId]) return true;
  // 今天标记的也算
  if (unlocked[goalId] === todayKey()) return false; // 已经弹过了
  return false;
}

// 标记已解锁
function markProbUnlocked(goalId) {
  var unlocked = loadJSON(STORAGE_PROB_UNLOCK, {});
  unlocked[goalId] = todayKey();
  saveJSON(STORAGE_PROB_UNLOCK, unlocked);
}

// 带缓存的计算
function getCachedSandbox(goal) {
  var checkinCount = (goal.checkins || []).length;
  if (_probCache[goal.id] && _probCacheCheckinCount[goal.id] === checkinCount) {
    return _probCache[goal.id];
  }
  var result = calcDecisionSandbox(goal);
  _probCache[goal.id] = result;
  _probCacheCheckinCount[goal.id] = checkinCount;
  return result;
}

// 清除缓存（打卡后调用）
function invalidateProbCache(goalId) {
  delete _probCache[goalId];
  delete _probCacheCheckinCount[goalId];
}

// 格式化概率档位颜色
var PROB_LEVEL_COLORS = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
};

// ============================================================
// 决策沙盘 — 渲染 & 交互
// ============================================================

function renderDecisionSandbox(goal, sb) {
  var html = '';
  html += '<h3 class="section-title">达成概率 · 决策沙盘</h3>';
  html += '<div class="sandbox-section sandbox-section--' + sb.level + '">';

  // 概率数字 + 问号图标
  html += '<div class="sandbox-headline">';
  html +=   '<div class="sandbox-prob">';
  html +=     '<span class="sandbox-prob__num" style="color:' + PROB_LEVEL_COLORS[sb.level] + '">' + sb.probability + '%</span>';
  html +=     '<button class="sandbox-prob__help" id="sandbox-help-btn" type="button" title="这是什么？">?</button>';
  html +=   '</div>';
  html +=   '<span class="sandbox-prob__label">' + escapeHtml(sb.levelText) + '</span>';
  html += '</div>';

  // 说明卡（默认隐藏）
  html += '<div class="sandbox-explain" id="sandbox-explain" hidden>';
  html +=   '<div class="sandbox-explain__card">';
  html +=     '<div class="sandbox-explain__item">';
  html +=       '<div class="sandbox-explain__q">这个数字是什么？</div>';
  html +=       '<div class="sandbox-explain__a">它把你最近30天的每一天收集起来，像抽卡片一样随机拼出1000种未来，数其中多少种能按时到终点。1000种里780种到了，就是78%。</div>';
  html +=     '</div>';
  html +=     '<div class="sandbox-explain__item">';
  html +=       '<div class="sandbox-explain__q">它为什么天天变？</div>';
  html +=       '<div class="sandbox-explain__a">你每打一次卡，卡片池就更新一次。你状态好，池子里好牌变多，概率就涨。</div>';
  html +=     '</div>';
  html +=     '<div class="sandbox-explain__item">';
  html +=       '<div class="sandbox-explain__q">红了怎么办？</div>';
  html +=       '<div class="sandbox-explain__a">红色不是判决书，是惯性报告。看下面的干预模拟——它告诉你每天多做一点，数字能涨多少。</div>';
  html +=     '</div>';
  html +=     '<div class="sandbox-explain__item">';
  html +=       '<div class="sandbox-explain__q">它的极限</div>';
  html +=       '<div class="sandbox-explain__a">它不认识明天的你。生病、放假、突然想通，它都算不到。它只测量你现在的惯性，测量不了你的决心。</div>';
  html +=     '</div>';
  html +=   '</div>';
  html +=   '<p class="sandbox-explain__foot">假设你延续近期节奏（加权偏向最近14天）。测量的是惯性，不是命运。</p>';
  html += '</div>';

  // 完成时间区间
  if (sb.completionText) {
    html += '<div class="sandbox-row">';
    html +=   '<span class="sandbox-row__label">预计完成</span>';
    html +=   '<span class="sandbox-row__value">' + escapeHtml(sb.completionText) + '</span>';
    html += '</div>';
  }

  // 固定对比行
  html += '<div class="sandbox-row sandbox-row--compare">';
  html +=   '<span class="sandbox-row__label">节奏对比</span>';
  html +=   '<span class="sandbox-row__value">' + escapeHtml(sb.compareText) + '</span>';
  html += '</div>';

  // 偏差提示
  if (sb.deviationTip) {
    html += '<div class="sandbox-tip sandbox-tip--' + (sb.deviationTip.indexOf('引擎') >= 0 ? 'encourage' : 'warn') + '">' + escapeHtml(sb.deviationTip) + '</div>';
  }

  // 惯性断裂
  if (sb.inertiaBreakTip) {
    html += '<div class="sandbox-row">';
    html +=   '<span class="sandbox-row__label">惯性检测</span>';
    html +=   '<span class="sandbox-row__value">' + escapeHtml(sb.inertiaBreakTip) + '</span>';
    html += '</div>';
  }

  // 干预模拟 / 边界分支
  if (!sb.showIntervention && sb.interventionBlockText) {
    html += '<div class="sandbox-intervention-block">' + escapeHtml(sb.interventionBlockText) + '</div>';
  } else if (sb.interventions.length > 0) {
    // 所有档位默认折叠（黄/红强制显示但折叠，用户点开查看）
    html += '<div class="sandbox-intervention sandbox-intervention--collapsed">';
    html +=   '<div class="sandbox-intervention__toggle" id="sandbox-intervention-toggle">';
    html +=     '<span>干预模拟</span>';
    html +=     '<span class="sandbox-intervention__arrow">▼</span>';
    html +=   '</div>';
    html +=   '<div class="sandbox-intervention__body" id="sandbox-intervention-body">';
    sb.interventions.forEach(function(iv) {
      html += '<div class="sandbox-intervention__row">';
      html +=   '<span class="sandbox-intervention__label">' + escapeHtml(iv.label) + '</span>';
      html +=   '<span class="sandbox-intervention__prob">概率从 ' + iv.fromProb + '% → ' + iv.toProb + '%</span>';
      html += '</div>';
    });
    html +=   '</div>';
    html += '</div>';
  } else if (sb.interventionBlockText) {
    html += '<div class="sandbox-intervention-block">' + escapeHtml(sb.interventionBlockText) + '</div>';
  }

  html += '</div>'; // .sandbox-section
  return html;
}

function bindDecisionSandbox(content, goal) {
  // 问号说明卡
  var helpBtn = content.querySelector('#sandbox-help-btn');
  var explain = content.querySelector('#sandbox-explain');
  if (helpBtn && explain) {
    helpBtn.addEventListener('click', function() {
      explain.hidden = !explain.hidden;
    });
  }

  // 干预模拟折叠
  var toggle = content.querySelector('#sandbox-intervention-toggle');
  var body = content.querySelector('#sandbox-intervention-body');
  var intervention = content.querySelector('.sandbox-intervention');
  if (toggle && intervention) {
    toggle.addEventListener('click', function() {
      intervention.classList.toggle('sandbox-intervention--collapsed');
      intervention.classList.toggle('sandbox-intervention--expanded');
    });
  }
}

// 首次解锁概率弹窗
function showProbUnlockCard(goalId) {
  var modal = document.getElementById('confirm-modal');
  var titleEl = document.getElementById('confirm-title');
  var descEl = document.getElementById('confirm-desc');
  var actionsEl = modal.querySelector('.confirm-modal__actions');

  titleEl.textContent = '🎯 数据够了';
  descEl.innerHTML = '从现在起，你能看见自己的惯性了';

  // 撒花
  launchConfetti();

  actionsEl.innerHTML = '';
  var goBtn = document.createElement('button');
  goBtn.className = 'btn btn--primary';
  goBtn.textContent = '去看看';
  goBtn.addEventListener('click', function() {
    closeAnyModal(modal);
    restoreConfirmActions();
    // 目标详情已经打开了，只需滚动到沙盘区域
    var sandbox = document.querySelector('.sandbox-section');
    if (sandbox) {
      sandbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn--ghost';
  closeBtn.textContent = '稍后';
  closeBtn.addEventListener('click', function() {
    closeAnyModal(modal);
    restoreConfirmActions();
  });

  actionsEl.appendChild(closeBtn);
  actionsEl.appendChild(goBtn);

  modal.hidden = false;
}

function drawTrendChart(goal) {
  var canvas = document.getElementById('trend-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.offsetWidth;
  var h = 160;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var days = [];
  var today = new Date();
  today.setHours(0,0,0,0);
  for (var i = 29; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var key = formatDate(d.toISOString());
    var total = 0;
    (goal.checkins || []).forEach(function(c) {
      if (c.date === key) {
        if (goal.type === 'value') {
          total = c.cumulative !== undefined ? c.cumulative : 0;
        } else {
          total += (c.amount || 0);
        }
      }
    });
    days.push({ date: key, total: total });
  }

  var maxVal = 1;
  days.forEach(function(d) { if (d.total > maxVal) maxVal = d.total; });

  var padL = 36, padR = 12, padT = 16, padB = 28;
  var chartW = w - padL - padR;
  var chartH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = padT + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // Y 轴刻度
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    var y = padT + (chartH / 4) * i;
    var val = Math.round(maxVal * (1 - i / 4));
    ctx.fillText(String(val), padL - 6, y + 3);
  }

  // X 轴日期刻度
  ctx.textAlign = 'center';
  days.forEach(function(d, i) {
    if (i % 5 === 0 || i === 29) {
      var x = padL + (chartW / 29) * i;
      var dt = new Date(d.date);
      ctx.fillText((dt.getMonth()+1) + '/' + dt.getDate(), x, h - 6);
    }
  });

  // 折线
  ctx.beginPath();
  days.forEach(function(d, i) {
    var x = padL + (chartW / 29) * i;
    var y = padT + chartH * (1 - d.total / maxVal);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 渐变填充
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.lineTo(padL, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56,189,248,0.12)';
  ctx.fill();

  // 数据点
  days.forEach(function(d, i) {
    if (d.total === 0) return;
    var x = padL + (chartW / 29) * i;
    var y = padT + chartH * (1 - d.total / maxVal);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  });
}

function launchConfetti() {
  var container = document.createElement('div');
  container.className = 'confetti';
  document.body.appendChild(container);
  var colors = ['#38bdf8', '#fbbf24', '#a78bfa', '#4ade80', '#f87171'];
  for (var i = 0; i < 60; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti__piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    piece.style.animationDelay = Math.random() * 0.3 + 's';
    piece.style.width = (6 + Math.random() * 6) + 'px';
    piece.style.height = (6 + Math.random() * 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(function() { container.remove(); }, 3500);
}

function addTimelineFromGoal(goal) {
  var timeline = loadJSON(STORAGE_TIMELINE, []);
  timeline.push({
    id: uuid(),
    date: todayKey(),
    title: '完成目标：' + goal.name,
    mood: 'auto',
    desc: '🏆 ' + (goal.why || ''),
    auto: true,
  });
  saveJSON(STORAGE_TIMELINE, timeline);
}

// ============================================================
// 贵人如云
// ============================================================

function loadNoble() { return loadJSON(STORAGE_NOBLE, []); }
function saveNoble(n) { saveJSON(STORAGE_NOBLE, n); }

// 关系 → 色相 class 映射
var RELATION_HUES = ['家人','挚友','导师','爱人','一面之缘'];

function relationClass(relation) {
  if (RELATION_HUES.indexOf(relation) >= 0) return relation;
  return 'custom';
}

// 圆形头像 HTML
function avatarCircleHTML(name, relation, size) {
  size = size || 56;
  var initial = (name || '?').charAt(0).toUpperCase();
  var cls = 'avatar-circle avatar-circle--' + relationClass(relation);
  if (size !== 56) {
    cls += '" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px';
  }
  return '<div class="' + cls + '">' + escapeHtml(initial) + '</div>';
}

// 生日距今天数（只比月日，不比年）
function daysToBirthday(birthday) {
  if (!birthday) return null;
  var today = new Date();
  today.setHours(0,0,0,0);
  var bd = new Date(birthday);
  bd.setFullYear(today.getFullYear());
  bd.setHours(0,0,0,0);
  var diff = daysBetween(today, bd);
  if (diff < 0) {
    // 已过，算明年
    bd.setFullYear(today.getFullYear() + 1);
    diff = daysBetween(today, bd);
  }
  return diff;
}

function renderNoble() {
  var nobles = loadNoble();
  var listEl = document.getElementById('noble-list');
  var filterVal = document.getElementById('noble-relation-filter').value;

  var filtered = nobles;
  if (filterVal) {
    filtered = nobles.filter(function(n) { return n.relation === filterVal; });
  }

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    var msg = nobles.length > 0 && filterVal ? '该关系类型下暂无贵人' : '还没有贵人。记录生命中重要的那些人。';
    listEl.innerHTML = emptyStateHTML('noble', msg, '', '');
    return;
  }

  filtered.forEach(function(n) {
    var card = document.createElement('div');
    card.className = 'noble-card';
    card.dataset.id = n.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    var givenCount = (n.given || []).length;
    var receivedCount = (n.received || []).length;

    // 生日蛋糕标记
    var cakeHTML = '';
    var bdDays = daysToBirthday(n.birthday);
    if (bdDays !== null && bdDays <= 7) {
      var cakeText = bdDays === 0 ? '🎂今天' : '🎂还有' + bdDays + '天';
      cakeHTML = '<span class="birthday-mark">' + cakeText + '</span>';
    }

    // 关系标签
    var relCls = 'relation-badge relation-badge--' + relationClass(n.relation);
    var relText = RELATION_HUES.indexOf(n.relation) >= 0 ? n.relation : (n.relation || '自定义');

    card.innerHTML =
      '<div style="position:relative;flex-shrink:0">' +
        avatarCircleHTML(n.name, n.relation) +
        cakeHTML +
      '</div>' +
      '<div class="noble-card__body">' +
        '<div class="noble-card__name">' + escapeHtml(n.name) + '</div>' +
        '<span class="' + relCls + '">' + escapeHtml(relText) + '</span>' +
        (n.metScene ? '<div class="noble-card__note">' + escapeHtml(n.metScene) + '</div>' : '') +
        '<div class="noble-card__note" style="margin-top:6px">我为TA ' + givenCount + ' 件 · TA为我 ' + receivedCount + ' 件</div>' +
      '</div>';

    card.addEventListener('click', function() { openNobleDetail(n.id); });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNobleDetail(n.id); }
    });
    listEl.appendChild(card);
  });
}

// ---- 贵人表单：关系自定义切换 ----
function adaptNobleFormByRelation(val) {
  var customField = document.getElementById('noble-relation-custom');
  customField.hidden = (val !== 'custom');
}

// ---- 贵人弹窗（新建/编辑）----
function openNobleModal(editId) {
  var modal = document.getElementById('noble-modal');
  var form = document.getElementById('noble-form');
  var titleEl = document.getElementById('noble-modal-title');
  var submitBtn = document.getElementById('noble-submit-btn');
  var editIdEl = document.getElementById('noble-edit-id');

  form.reset();

  if (editId) {
    var nobles = loadNoble();
    var n = nobles.find(function(x) { return x.id === editId; });
    if (!n) return;
    titleEl.textContent = '编辑贵人';
    submitBtn.textContent = '保存';
    editIdEl.value = editId;
    form.querySelector('[name="name"]').value = n.name || '';
    // 关系回填
    var relSelect = form.querySelector('[name="relation"]');
    if (RELATION_HUES.indexOf(n.relation) >= 0) {
      relSelect.value = n.relation;
    } else {
      relSelect.value = 'custom';
      form.querySelector('[name="relationCustom"]').value = n.relation || '';
    }
    adaptNobleFormByRelation(relSelect.value);
    form.querySelector('[name="metDate"]').value = n.metDate || '';
    form.querySelector('[name="birthday"]').value = n.birthday || '';
    form.querySelector('[name="metScene"]').value = n.metScene || '';
    form.querySelector('[name="note"]').value = n.note || '';
  } else {
    titleEl.textContent = '添加贵人';
    submitBtn.textContent = '添加';
    editIdEl.value = '';
    adaptNobleFormByRelation('家人');
  }

  modal.hidden = false;
  trapFocus(modal);
}

function initNobleModal() {
  var modal = document.getElementById('noble-modal');
  var form = document.getElementById('noble-form');
  var relSelect = document.getElementById('noble-relation-select');

  relSelect.addEventListener('change', function() {
    adaptNobleFormByRelation(relSelect.value);
  });

  document.getElementById('noble-add-btn').addEventListener('click', function() {
    openNobleModal(null);
  });

  modal.querySelectorAll('[data-close-noble-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var name = fd.get('name').trim();
    var relationRaw = fd.get('relation');
    var relation = relationRaw === 'custom' ? (fd.get('relationCustom') || '').trim() : relationRaw;
    if (!relation) relation = '一面之缘';
    var metDate = fd.get('metDate') || '';
    var birthday = fd.get('birthday') || '';
    var metScene = (fd.get('metScene') || '').trim();
    var note = (fd.get('note') || '').trim();
    var editId = fd.get('editId');

    if (editId) {
      var nobles0 = loadNoble();
      var n0 = nobles0.find(function(x) { return x.id === editId; });
      if (!n0) return;
      n0.name = name;
      n0.relation = relation;
      n0.metDate = metDate;
      n0.birthday = birthday;
      n0.metScene = metScene;
      n0.note = note;
      saveNoble(nobles0);
      closeAnyModal(modal);
      renderNoble();
      showToast('贵人信息已更新', 'success');
    } else {
      var noble = {
        id: uuid(),
        name: name,
        relation: relation,
        metDate: metDate,
        birthday: birthday,
        metScene: metScene,
        note: note,
        given: [],
        received: [],
        photo: '',
        stories: [],
        createdDate: new Date().toISOString(),
      };
      var nobles1 = loadNoble();
      nobles1.push(noble);
      saveNoble(nobles1);
      closeAnyModal(modal);
      renderNoble();
      showToast('贵人已添加', 'success');
    }
  });

  // 筛选器
  document.getElementById('noble-relation-filter').addEventListener('change', renderNoble);
}

// ---- Canvas 压缩图片到最长边300px JPEG base64 ----
function compressImage(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxEdge = 300;
      var w = img.width, h = img.height;
      if (w > h) {
        if (w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
      } else {
        if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataURL = canvas.toDataURL('image/jpeg', 0.85);
      cb(dataURL);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- 贵人详情弹窗（四区块）----
function openNobleDetail(id) {
  var nobles = loadNoble();
  var noble = nobles.find(function(n) { return n.id === id; });
  if (!noble) return;

  var modal = document.getElementById('noble-detail-modal');
  var content = document.getElementById('noble-detail-content');
  var relCls = 'relation-badge relation-badge--' + relationClass(noble.relation);
  var relText = RELATION_HUES.indexOf(noble.relation) >= 0 ? noble.relation : (noble.relation || '自定义');

  var html = '';

  // ---- 头部：头像 + 名字 + 编辑/删除 ----
  html += '<div class="detail-header">';
  html +=   '<div class="noble-detail-header">';
  html +=     avatarCircleHTML(noble.name, noble.relation, 72);
  html +=     '<div><h2>' + escapeHtml(noble.name) + '</h2><span class="' + relCls + '">' + escapeHtml(relText) + '</span></div>';
  html +=   '</div>';
  html +=   '<button class="btn btn--ghost btn--small" id="noble-edit-btn" type="button">编辑</button>';
  html += '</div>';

  // ---- 区块一：资料区 ----
  html += '<div class="profile-section">';
  html +=   '<h3 class="profile-section__title">资料</h3>';
  html +=   '<div class="modal__form">';
  html +=     '<label class="field"><span class="field__label">名字</span><input type="text" id="pf-name" class="field__input" value="' + escapeHtml(noble.name || '') + '"></label>';
  html +=     '<label class="field"><span class="field__label">关系</span>';
  html +=       '<select id="pf-relation" class="field__input">';
  RELATION_HUES.forEach(function(r) {
    html += '<option value="' + r + '"' + (noble.relation === r ? ' selected' : '') + '>' + r + '</option>';
  });
  var isCustom = RELATION_HUES.indexOf(noble.relation) < 0;
  html +=         '<option value="custom"' + (isCustom ? ' selected' : '') + '>自定义…</option>';
  html +=       '</select>';
  html +=     '</label>';
  html +=     '<label class="field" id="pf-relation-custom"' + (isCustom ? '' : ' hidden') + '><span class="field__label">自定义关系</span><input type="text" id="pf-relation-custom-input" class="field__input" value="' + escapeHtml(isCustom ? noble.relation : '') + '" placeholder="例如：战友、同窗…"></label>';
  html +=     '<div class="field-row">';
  html +=       '<label class="field"><span class="field__label">初识日期</span><input type="date" id="pf-metDate" class="field__input" value="' + (noble.metDate || '') + '"></label>';
  html +=       '<label class="field"><span class="field__label">生日</span><input type="date" id="pf-birthday" class="field__input" value="' + (noble.birthday || '') + '"></label>';
  html +=     '</div>';
  html +=     '<label class="field"><span class="field__label">相识场景</span><input type="text" id="pf-metScene" class="field__input" value="' + escapeHtml(noble.metScene || '') + '" placeholder="一句话"></label>';
  html +=     '<label class="field"><span class="field__label">备注</span><textarea id="pf-note" class="field__input" rows="2">' + escapeHtml(noble.note || '') + '</textarea></label>';
  html +=     '<button class="btn btn--primary btn--small profile-section__save" id="pf-save-btn" type="button">保存资料</button>';
  html +=   '</div>';
  html += '</div>';

  // ---- 区块二：恩情账簿 ----
  var givenCount = (noble.given || []).length;
  var receivedCount = (noble.received || []).length;
  html += '<h3 class="section-title" style="margin-top:0">恩情账簿</h3>';
  html += '<div class="debt-book">';

  // 我为TA
  html += '<div class="debt-column">';
  html +=   '<div class="debt-column__title debt-column__title--given">💚 我为TA做的 <span class="debt-count">' + givenCount + ' 件</span></div>';
  html +=   '<div id="debt-given-list">';
  if (noble.given && noble.given.length > 0) {
    noble.given.forEach(function(item, i) {
      html += '<div class="debt-item">';
      html +=   '<div class="debt-item__date">' + escapeHtml(item.date || '') + '</div>';
      html +=   '<div class="debt-item__row"><span class="debt-item__text">' + escapeHtml(item.event || '') + '</span><button class="debt-item__del" data-dir="given" data-idx="' + i + '" type="button">✕</button></div>';
      html += '</div>';
    });
  } else {
    html += '<p style="font-size:12px;color:var(--t-2);padding:8px 0">暂无记录</p>';
  }
  html +=   '</div>';
  html +=   '<div class="debt-add-row"><input type="date" id="debt-given-date" value="' + todayKey() + '"><input type="text" id="debt-given-input" placeholder="记一件…"><button class="given" data-dir="given" type="button">记入</button></div>';
  html += '</div>';

  // TA为我
  html += '<div class="debt-column">';
  html +=   '<div class="debt-column__title debt-column__title--received">⭐ TA为我做的 <span class="debt-count">' + receivedCount + ' 件</span></div>';
  html +=   '<div id="debt-received-list">';
  if (noble.received && noble.received.length > 0) {
    noble.received.forEach(function(item, i) {
      html += '<div class="debt-item">';
      html +=   '<div class="debt-item__date">' + escapeHtml(item.date || '') + '</div>';
      html +=   '<div class="debt-item__row"><span class="debt-item__text">' + escapeHtml(item.event || '') + '</span><button class="debt-item__del" data-dir="received" data-idx="' + i + '" type="button">✕</button></div>';
      html += '</div>';
    });
  } else {
    html += '<p style="font-size:12px;color:var(--t-2);padding:8px 0">暂无记录</p>';
  }
  html +=   '</div>';
  html +=   '<div class="debt-add-row"><input type="date" id="debt-received-date" value="' + todayKey() + '"><input type="text" id="debt-received-input" placeholder="记一件…"><button class="received" data-dir="received" type="button">记入</button></div>';
  html += '</div>';

  html += '</div>'; // .debt-book

  // ---- 区块三：合照 ----
  html += '<div class="photo-section">';
  html +=   '<h3 class="photo-section__title">合照</h3>';
  if (noble.photo) {
    html += '<img class="photo-display" src="' + noble.photo + '" alt="合照">';
    html += '<div class="photo-actions">';
    html +=   '<button class="btn btn--ghost btn--small" id="photo-change-btn" type="button">更换照片</button>';
    html +=   '<button class="btn btn--ghost btn--small" id="photo-delete-btn" type="button">删除照片</button>';
    html +=   '<span class="photo-actions__hint">照片仅存于本机浏览器</span>';
    html += '</div>';
  } else {
    html += '<div class="photo-empty">还没有合照</div>';
    html += '<div class="photo-actions">';
    html +=   '<button class="btn btn--primary btn--small" id="photo-upload-btn" type="button">上传合照</button>';
    html +=   '<span class="photo-actions__hint">照片仅存于本机浏览器</span>';
    html += '</div>';
  }
  html +=   '<input type="file" id="photo-file-input" accept="image/*" style="display:none">';
  html += '</div>';

  // ---- 区块四：缘记时间线 ----
  html += '<h3 class="section-title">缘记时间线</h3>';
  var stories = (noble.stories || []).slice().sort(function(a,b) {
    return new Date(b.date) - new Date(a.date);
  });
  if (stories.length > 0) {
    html += '<div class="story-timeline">';
    stories.forEach(function(s) {
      var realIdx = noble.stories.indexOf(s);
      html += '<div class="story-item">';
      html +=   '<div class="story-item__date">' + escapeHtml(s.date || '') + '</div>';
      html +=   '<div class="story-item__content">' + escapeHtml(s.content || '') + '</div>';
      html +=   '<button class="story-item__del" data-story-idx="' + realIdx + '" type="button">删除</button>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<p class="empty-hint" style="padding:var(--s-4) 0">还没有缘记，记录你们的故事。</p>';
  }
  html += '<div class="story-add">';
  html +=   '<input type="date" id="story-date-input" class="field__input" value="' + todayKey() + '">';
  html +=   '<input type="text" id="story-text-input" class="field__input" placeholder="记一段缘…">';
  html +=   '<button class="btn btn--primary btn--small" id="story-add-btn" type="button">追加</button>';
  html += '</div>';

  // ---- 删除贵人（底部红色弱样式）----
  html += '<div style="margin-top:var(--s-12);padding-top:var(--s-6);border-top:1px solid var(--border)">';
  html +=   '<button class="btn btn--ghost btn--danger-weak" id="noble-delete-btn" type="button">删除此贵人</button>';
  html += '</div>';

  content.innerHTML = html;
  modal.hidden = false;
  trapFocus(modal);

  // ---- 编辑按钮 ----
  document.getElementById('noble-edit-btn').addEventListener('click', function() {
    closeAnyModal(modal);
    openNobleModal(id);
  });

  // ---- 资料区关系自定义切换 ----
  var pfRelSelect = document.getElementById('pf-relation');
  pfRelSelect.addEventListener('change', function() {
    document.getElementById('pf-relation-custom').hidden = (pfRelSelect.value !== 'custom');
  });

  // ---- 资料区保存 ----
  document.getElementById('pf-save-btn').addEventListener('click', function() {
    var nobles2 = loadNoble();
    var n2 = nobles2.find(function(x) { return x.id === id; });
    if (!n2) return;
    n2.name = document.getElementById('pf-name').value.trim();
    var relVal = document.getElementById('pf-relation').value;
    n2.relation = relVal === 'custom' ? (document.getElementById('pf-relation-custom-input').value.trim() || '自定义') : relVal;
    n2.metDate = document.getElementById('pf-metDate').value || '';
    n2.birthday = document.getElementById('pf-birthday').value || '';
    n2.metScene = document.getElementById('pf-metScene').value.trim();
    n2.note = document.getElementById('pf-note').value.trim();
    saveNoble(nobles2);
    openNobleDetail(id);
    renderNoble();
    showToast('资料已保存', 'success');
  });

  // ---- 删除贵人 ----
  document.getElementById('noble-delete-btn').addEventListener('click', function() {
    confirmDelete('删除贵人', '确定删除「' + noble.name + '」及其所有记录？此操作不可撤销。', function() {
      var deleted = JSON.parse(JSON.stringify(noble));
      saveNoble(loadNoble().filter(function(n) { return n.id !== id; }));
      closeAnyModal(modal);
      renderNoble();
      showToast('贵人已删除', 'success', {
        undo: function() {
          var nobles2 = loadNoble();
          nobles2.push(deleted);
          saveNoble(nobles2);
          renderNoble();
        }
      });
    });
  });

  // ---- 恩情账簿：添加条目 ----
  content.querySelectorAll('.debt-add-row button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var dir = btn.dataset.dir;
      var dateInput = document.getElementById('debt-' + dir + '-date');
      var textInput = document.getElementById('debt-' + dir + '-input');
      var date = dateInput.value || todayKey();
      var event = textInput.value.trim();
      if (!event) {
        showToast('请输入事件内容', 'warning');
        return;
      }
      var nobles2 = loadNoble();
      var n2 = nobles2.find(function(x) { return x.id === id; });
      if (!n2[dir]) n2[dir] = [];
      n2[dir].push({ date: date, event: event });
      saveNoble(nobles2);
      openNobleDetail(id);
      renderNoble();
      showToast('已记录', 'success');
    });
  });

  // ---- 恩情账簿：删除条目 ----
  content.querySelectorAll('.debt-item__del').forEach(function(el) {
    el.addEventListener('click', function() {
      var dir = el.dataset.dir;
      var idx = parseInt(el.dataset.idx);
      confirmDelete('删除记录', '确定删除这条恩情记录？', function() {
        var nobles2 = loadNoble();
        var n2 = nobles2.find(function(x) { return x.id === id; });
        var deletedItem = n2[dir][idx];
        n2[dir].splice(idx, 1);
        saveNoble(nobles2);
        openNobleDetail(id);
        renderNoble();
        showToast('已删除', 'success', {
          undo: function() {
            var nobles3 = loadNoble();
            var n3 = nobles3.find(function(x) { return x.id === id; });
            n3[dir].splice(idx, 0, deletedItem);
            saveNoble(nobles3);
            openNobleDetail(id);
            renderNoble();
          }
        });
      });
    });
  });

  // ---- 合照：上传/更换/删除 ----
  var fileInput = document.getElementById('photo-file-input');

  var uploadBtn = document.getElementById('photo-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function() { fileInput.click(); });
  }
  var changeBtn = document.getElementById('photo-change-btn');
  if (changeBtn) {
    changeBtn.addEventListener('click', function() { fileInput.click(); });
  }
  var deletePhotoBtn = document.getElementById('photo-delete-btn');
  if (deletePhotoBtn) {
    deletePhotoBtn.addEventListener('click', function() {
      confirmDelete('删除合照', '确定删除合照？此操作不可撤销。', function() {
        var nobles2 = loadNoble();
        var n2 = nobles2.find(function(x) { return x.id === id; });
        var oldPhoto = n2.photo;
        n2.photo = '';
        saveNoble(nobles2);
        openNobleDetail(id);
        renderNoble();
        showToast('合照已删除', 'success');
      });
    });
  }

  fileInput.addEventListener('change', function() {
    var file = fileInput.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片不能超过10MB', 'warning');
      return;
    }
    compressImage(file, function(dataURL) {
      var nobles2 = loadNoble();
      var n2 = nobles2.find(function(x) { return x.id === id; });
      n2.photo = dataURL;
      saveNoble(nobles2);
      openNobleDetail(id);
      renderNoble();
      showToast('合照已保存', 'success');
    });
  });

  // ---- 缘记时间线：追加 ----
  document.getElementById('story-add-btn').addEventListener('click', function() {
    var date = document.getElementById('story-date-input').value || todayKey();
    var text = document.getElementById('story-text-input').value.trim();
    if (!text) {
      showToast('请输入内容', 'warning');
      return;
    }
    var nobles2 = loadNoble();
    var n2 = nobles2.find(function(x) { return x.id === id; });
    if (!n2.stories) n2.stories = [];
    n2.stories.push({ date: date, content: text });
    saveNoble(nobles2);
    openNobleDetail(id);
    renderNoble();
    showToast('缘记已追加', 'success');
  });

  // ---- 缘记时间线：删除 ----
  content.querySelectorAll('.story-item__del').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(el.dataset.storyIdx);
      confirmDelete('删除缘记', '确定删除这条缘记？', function() {
        var nobles2 = loadNoble();
        var n2 = nobles2.find(function(x) { return x.id === id; });
        var deleted = n2.stories[idx];
        n2.stories.splice(idx, 1);
        saveNoble(nobles2);
        openNobleDetail(id);
        renderNoble();
        showToast('已删除', 'success', {
          undo: function() {
            var nobles3 = loadNoble();
            var n3 = nobles3.find(function(x) { return x.id === id; });
            n3.stories.splice(idx, 0, deleted);
            saveNoble(nobles3);
            openNobleDetail(id);
            renderNoble();
          }
        });
      });
    });
  });
}

// ============================================================
// 既往也咎 — 时间线
// ============================================================

function loadTimeline() { return loadJSON(STORAGE_TIMELINE, []); }
function saveTimeline(t) { saveJSON(STORAGE_TIMELINE, t); }
function loadLessons()  { return loadJSON(STORAGE_LESSONS, []); }
function saveLessons(l)  { saveJSON(STORAGE_LESSONS, l); }
function loadReviews()   { return loadJSON(STORAGE_REVIEWS, []); }
function saveReviews(r)  { saveJSON(STORAGE_REVIEWS, r); }

var MOOD_LABELS = {
  highlight: '高光',
  low: '低谷',
  turning: '转折',
  ordinary: '平凡',
  auto: '自动',
};

var DEFAULT_LESSON_TAGS = ['学业', '感情', '金钱', '健康'];
var STORAGE_PAST_TAB = 'lifeos_past_tab';
var STORAGE_LESSON_TAGS = 'lifeos_lesson_tags';

function loadLessonTags() {
  var custom = loadJSON(STORAGE_LESSON_TAGS, []);
  var combined = DEFAULT_LESSON_TAGS.slice();
  custom.forEach(function(t) { if (combined.indexOf(t) < 0) combined.push(t); });
  return combined;
}

function saveLessonTag(tag) {
  var custom = loadJSON(STORAGE_LESSON_TAGS, []);
  if (custom.indexOf(tag) < 0 && DEFAULT_LESSON_TAGS.indexOf(tag) < 0) {
    custom.push(tag);
    saveJSON(STORAGE_LESSON_TAGS, custom);
  }
}

function renderPast() {
  renderTimeline();
  renderLessons();
  renderReviews();
  renderDaily();
  renderCapsules();
  updateYearFilter();
  updateLessonTagFilter();
}

function updateYearFilter() {
  var timeline = loadTimeline();
  var yearSet = {};
  timeline.forEach(function(t) {
    if (t.date) {
      var y = t.date.substring(0, 4);
      yearSet[y] = true;
    }
  });
  // 也从已完成目标中提取年份
  var goals = loadGoals();
  goals.forEach(function(g) {
    if (g.completedDate) {
      var y = g.completedDate.substring(0, 4);
      yearSet[y] = true;
    }
  });
  var years = Object.keys(yearSet).sort().reverse();
  var select = document.getElementById('timeline-year-filter');
  var current = select.value;
  select.innerHTML = '<option value="">全部年份</option>' +
    years.map(function(y) { return '<option value="' + y + '">' + y + '年</option>'; }).join('');
  select.value = current;
}

function updateLessonTagFilter() {
  var lessons = loadLessons();
  var tagSet = {};
  lessons.forEach(function(l) { if (l.tag) tagSet[l.tag] = true; });
  var tags = Object.keys(tagSet).sort();
  var select = document.getElementById('lesson-tag-filter');
  var current = select.value;
  select.innerHTML = '<option value="">全部标签</option>' +
    tags.map(function(t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
  select.value = current;
}

// ---- 已完成目标只读区块 ----
function renderCompletedGoalsInTimeline(yearFilter) {
  var goals = loadGoals().filter(function(g) { return g.completed && g.completedDate; });
  if (yearFilter) {
    goals = goals.filter(function(g) { return g.completedDate.startsWith(yearFilter); });
  }
  if (goals.length === 0) return '';

  goals.sort(function(a, b) { return new Date(b.completedDate) - new Date(a.completedDate); });

  var html = '<div class="completed-goals-section">';
  html +=   '<div class="completed-goals-section__title">🏆 完成的目标</div>';
  goals.forEach(function(g) {
    var dateStr = g.completedDate ? formatDate(g.completedDate) : '';
    html += '<div class="completed-goal-item" data-goal-id="' + g.id + '" role="button" tabindex="0">';
    html +=   '<span class="completed-goal-item__trophy">🏆</span>';
    html +=   '<div class="completed-goal-item__info">';
    html +=     '<div class="completed-goal-item__name">' + escapeHtml(g.name) + '</div>';
    html +=     '<div class="completed-goal-item__date">完成于 ' + dateStr + '</div>';
    html +=   '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderTimeline() {
  var timeline = loadTimeline().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  var yearFilter = document.getElementById('timeline-year-filter').value;
  var list = document.getElementById('past-timeline');

  var filtered = timeline;
  if (yearFilter) filtered = timeline.filter(function(t) { return t.date && t.date.startsWith(yearFilter); });

  // 已完成目标只读区块
  var completedHTML = renderCompletedGoalsInTimeline(yearFilter);

  list.innerHTML = '';
  if (filtered.length === 0 && !completedHTML) {
    list.innerHTML = '<li>' + emptyStateHTML('timeline', '还没有人生节点。记录那些塑造你的时刻。', '', '') + '</li>';
    return;
  }

  // 先插入完成目标区块
  if (completedHTML) {
    var wrapper = document.createElement('li');
    wrapper.style.listStyle = 'none';
    wrapper.innerHTML = completedHTML;
    // 绑定点击跳转
    wrapper.querySelectorAll('.completed-goal-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var gid = el.dataset.goalId;
        switchView('goals');
        setTimeout(function() { openGoalDetail(gid); }, 300);
      });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var gid = el.dataset.goalId;
          switchView('goals');
          setTimeout(function() { openGoalDetail(gid); }, 300);
        }
      });
    });
    list.appendChild(wrapper);
  }

  filtered.forEach(function(t) {
    var li = document.createElement('li');
    li.className = 'timeline-node timeline-node--' + t.mood;
    var moodDotHTML = '<span class="mood-dot mood-dot--' + t.mood + '"></span>';
    var actionsHTML = '';
    if (!t.auto) {
      actionsHTML = '<div class="item-actions">' +
        '<button class="item-actions__btn" data-action="edit" data-id="' + t.id + '" type="button">编辑</button>' +
        '<button class="item-actions__btn item-actions__btn--danger" data-action="del" data-id="' + t.id + '" type="button">删除</button>' +
      '</div>';
    } else {
      actionsHTML = '<span style="font-size:12px;color:var(--c-accent);opacity:0.5">自动生成</span>';
    }

    li.innerHTML =
      '<div class="timeline-node__date">' + moodDotHTML + t.date +
        ' <span class="timeline-node__mood timeline-node__mood--' + t.mood + '">' + (MOOD_LABELS[t.mood] || '') + '</span>' +
      '</div>' +
      '<div class="timeline-node__title">' + escapeHtml(t.title) + '</div>' +
      (t.desc ? '<div class="timeline-node__desc">' + escapeHtml(t.desc) + '</div>' : '') +
      actionsHTML;

    if (!t.auto) {
      li.querySelectorAll('[data-action]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var action = btn.dataset.action;
          if (action === 'edit') {
            openTimelineModal(t.id);
          } else if (action === 'del') {
            var deletedNode = t;
            confirmDelete('删除节点', '确定删除「' + t.title + '」？', function() {
              saveTimeline(loadTimeline().filter(function(x) { return x.id !== t.id; }));
              renderTimeline();
              updateYearFilter();
              showToast('节点已删除', 'success', {
                undo: function() {
                  var tl = loadTimeline();
                  tl.push(deletedNode);
                  saveTimeline(tl);
                  renderTimeline();
                  updateYearFilter();
                }
              });
            });
          }
        });
      });
    }
    list.appendChild(li);
  });
}

function openTimelineModal(editId) {
  var modal = document.getElementById('timeline-modal');
  var form = document.getElementById('timeline-form');
  var titleEl = document.getElementById('timeline-modal-title');
  var submitBtn = document.getElementById('timeline-submit-btn');
  var editIdEl = document.getElementById('timeline-edit-id');

  form.reset();

  if (editId) {
    var timeline = loadTimeline();
    var node = timeline.find(function(t) { return t.id === editId; });
    if (!node) return;
    titleEl.textContent = '编辑节点';
    submitBtn.textContent = '保存';
    editIdEl.value = editId;
    form.querySelector('[name="date"]').value = node.date || todayKey();
    form.querySelector('[name="title"]').value = node.title || '';
    form.querySelector('[name="mood"]').value = node.mood || 'ordinary';
    form.querySelector('[name="desc"]').value = node.desc || '';
  } else {
    titleEl.textContent = '添加人生节点';
    submitBtn.textContent = '添加';
    editIdEl.value = '';
    form.querySelector('[name="date"]').value = todayKey();
  }

  modal.hidden = false;
  trapFocus(modal);
}

function initTimelineModal() {
  var modal = document.getElementById('timeline-modal');
  var form = document.getElementById('timeline-form');

  document.getElementById('add-timeline-btn').addEventListener('click', function() {
    openTimelineModal(null);
  });

  modal.querySelectorAll('[data-close-timeline-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var editId = fd.get('editId');
    var date = fd.get('date');
    var title = fd.get('title').trim();
    var mood = fd.get('mood');
    var desc = fd.get('desc').trim();

    if (editId) {
      var timeline0 = loadTimeline();
      var node0 = timeline0.find(function(t) { return t.id === editId; });
      if (!node0) return;
      node0.date = date;
      node0.title = title;
      node0.mood = mood;
      node0.desc = desc;
      saveTimeline(timeline0);
      closeAnyModal(modal);
      renderTimeline();
      updateYearFilter();
      showToast('节点已更新', 'success');
    } else {
      var node = {
        id: uuid(),
        date: date,
        title: title,
        mood: mood,
        desc: desc,
        auto: false,
      };
      var timeline1 = loadTimeline();
      timeline1.push(node);
      saveTimeline(timeline1);
      closeAnyModal(modal);
      renderTimeline();
      updateYearFilter();
      showToast('节点已添加', 'success');
    }
  });

  document.getElementById('timeline-year-filter').addEventListener('change', renderTimeline);
}

// ============================================================
// 教训复发检测
// ============================================================

// 中文二元字组切分
function bigram(text) {
  if (!text) return [];
  var s = text.replace(/\s+/g, '');
  if (s.length < 2) return [s];
  var grams = [];
  for (var i = 0; i < s.length - 1; i++) {
    grams.push(s.substring(i, i + 2));
  }
  return grams;
}

// Jaccard 相似系数
function bigramJaccard(text1, text2) {
  var bg1 = bigram(text1);
  var bg2 = bigram(text2);
  if (bg1.length === 0 || bg2.length === 0) return 0;

  var set1 = {};
  bg1.forEach(function(g) { set1[g] = true; });
  var set2 = {};
  bg2.forEach(function(g) { set2[g] = true; });

  var intersection = 0;
  Object.keys(set1).forEach(function(g) { if (set2[g]) intersection++; });

  var union = Object.keys(set1).length + Object.keys(set2).length - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

// 检查复发：返回匹配的历史教训数组
function checkLessonRecurrence(newPit) {
  var lessons = loadLessons();
  var matches = [];
  lessons.forEach(function(l) {
    var sim = bigramJaccard(newPit, l.pit);
    if (sim >= 0.25) {
      matches.push({ lesson: l, similarity: sim });
    }
  });
  matches.sort(function(a, b) { return b.similarity - a.similarity; });
  return matches;
}

// 显示复发警示卡
function showRecurrenceWarning(matches, onConfirm, onDismiss) {
  var modal = document.getElementById('confirm-modal');
  var titleEl = document.getElementById('confirm-title');
  var descEl = document.getElementById('confirm-desc');
  var okBtn = document.getElementById('confirm-ok');
  var actionsEl = modal.querySelector('.confirm-modal__actions');

  titleEl.textContent = '⚠ 疑似重蹈覆辙';
  var matchText = matches.map(function(m) {
    return '·「' + m.lesson.pit + '」（相似度 ' + Math.round(m.similarity * 100) + '%）';
  }).join('\n');
  descEl.innerHTML = '这条教训与以下历史记录高度相似：\n' + escapeHtml(matchText);

  // 改造按钮：三个选项
  actionsEl.innerHTML = '';
  var dismissBtn = document.createElement('button');
  dismissBtn.className = 'btn btn--ghost';
  dismissBtn.textContent = '不是同一件事';
  dismissBtn.addEventListener('click', function() {
    closeAnyModal(modal);
    // 恢复按钮
    restoreConfirmActions();
    if (onDismiss) onDismiss();
  });

  var confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--danger';
  confirmBtn.textContent = '确实重蹈覆辙';
  confirmBtn.addEventListener('click', function() {
    closeAnyModal(modal);
    restoreConfirmActions();
    if (onConfirm) onConfirm();
  });

  actionsEl.appendChild(dismissBtn);
  actionsEl.appendChild(confirmBtn);

  modal.hidden = false;
  trapFocus(modal);
}

// 恢复确认弹窗的默认按钮
function restoreConfirmActions() {
  var modal = document.getElementById('confirm-modal');
  var actionsEl = modal.querySelector('.confirm-modal__actions');
  actionsEl.innerHTML =
    '<button type="button" class="btn btn--ghost" data-close-confirm>取消</button>' +
    '<button type="button" class="btn btn--danger" id="confirm-ok">删除</button>';
  // 重新绑定关闭
  actionsEl.querySelectorAll('[data-close-confirm]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });
}

// ============================================================
// 既往也咎 — 教训库
// ============================================================

function renderLessons() {
  var lessons = loadLessons().sort(function(a, b) { return new Date(b.created) - new Date(a.created); });
  var tagFilter = document.getElementById('lesson-tag-filter').value;
  var list = document.getElementById('lesson-list');

  var filtered = lessons;
  if (tagFilter) filtered = lessons.filter(function(l) { return l.tag === tagFilter; });

  // 复发≥2次的教训置顶
  filtered.sort(function(a, b) {
    var aRec = (a.recurrenceCount || 0);
    var bRec = (b.recurrenceCount || 0);
    if (aRec >= 2 && bRec < 2) return -1;
    if (bRec >= 2 && aRec < 2) return 1;
    return new Date(b.created) - new Date(a.created);
  });

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = emptyStateHTML('lesson', '还没有教训记录。踩过的坑，都是成长的养分。', '', '');
    return;
  }

  filtered.forEach(function(l) {
    var card = document.createElement('div');
    var isRecurrence = (l.recurrenceCount || 0) >= 2;
    card.className = 'lesson-card' + (isRecurrence ? ' lesson-card--recurrence' : '') + (l.isRecurrence ? ' lesson-card--recurrent' : '');
    var recurrenceBadge = '';
    if (l.isRecurrence) {
      recurrenceBadge = '<span class="lesson-card__recurrence-badge">复发</span>';
    }
    var recurrenceCount = '';
    if ((l.recurrenceCount || 0) >= 2) {
      recurrenceCount = '<span class="lesson-card__recurrence-count">⚠ 已复发 ' + l.recurrenceCount + ' 次</span>';
    }
    card.innerHTML =
      recurrenceCount +
      '<div class="lesson-card__pit">坑：' + escapeHtml(l.pit) + '</div>' +
      (l.cost ? '<div class="lesson-card__cost">代价：' + escapeHtml(l.cost) + '</div>' : '') +
      (l.lesson ? '<div class="lesson-card__lesson">「' + escapeHtml(l.lesson) + '」</div>' : '') +
      '<span class="lesson-card__tag">' + escapeHtml(l.tag) + '</span>' +
      recurrenceBadge +
      '<div class="item-actions">' +
        '<button class="item-actions__btn" data-action="edit" data-id="' + l.id + '" type="button">编辑</button>' +
        '<button class="item-actions__btn item-actions__btn--danger" data-action="del" data-id="' + l.id + '" type="button">删除</button>' +
      '</div>';

    card.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        if (action === 'edit') {
          openLessonModal(l.id);
        } else if (action === 'del') {
          var deleted = l;
          confirmDelete('删除教训', '确定删除这条教训记录？', function() {
            saveLessons(loadLessons().filter(function(x) { return x.id !== l.id; }));
            renderLessons();
            updateLessonTagFilter();
            showToast('教训已删除', 'success', {
              undo: function() {
                var ls = loadLessons();
                ls.push(deleted);
                saveLessons(ls);
                renderLessons();
                updateLessonTagFilter();
              }
            });
          });
        }
      });
    });
    list.appendChild(card);
  });
}

function openLessonModal(editId) {
  var modal = document.getElementById('lesson-modal');
  var form = document.getElementById('lesson-form');
  var titleEl = document.getElementById('lesson-modal-title');
  var submitBtn = document.getElementById('lesson-submit-btn');
  var editIdEl = document.getElementById('lesson-edit-id');
  var tagSelect = document.getElementById('lesson-tag-select');
  var tagCustomField = document.getElementById('lesson-tag-custom-field');

  form.reset();

  // 重建标签选项（含自定义标签）
  var allTags = loadLessonTags();
  tagSelect.innerHTML = allTags.map(function(t) {
    return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
  }).join('') + '<option value="custom">+ 自定义</option>';

  tagCustomField.hidden = true;

  if (editId) {
    var lessons = loadLessons();
    var l = lessons.find(function(x) { return x.id === editId; });
    if (!l) return;
    titleEl.textContent = '编辑教训';
    submitBtn.textContent = '保存';
    editIdEl.value = editId;
    form.querySelector('[name="pit"]').value = l.pit || '';
    form.querySelector('[name="cost"]').value = l.cost || '';
    form.querySelector('[name="lesson"]').value = l.lesson || '';
    // 检查标签是否在选项中
    if (allTags.indexOf(l.tag) >= 0) {
      tagSelect.value = l.tag;
    } else {
      // 不在选项中，选自定义并填入
      tagSelect.value = 'custom';
      tagCustomField.hidden = false;
      form.querySelector('[name="tagCustom"]').value = l.tag;
    }
  } else {
    titleEl.textContent = '添加教训';
    submitBtn.textContent = '添加';
    editIdEl.value = '';
  }

  modal.hidden = false;
  trapFocus(modal);
}

function initLessonModal() {
  var modal = document.getElementById('lesson-modal');
  var form = document.getElementById('lesson-form');
  var tagSelect = document.getElementById('lesson-tag-select');
  var tagCustomField = document.getElementById('lesson-tag-custom-field');

  tagSelect.addEventListener('change', function() {
    tagCustomField.hidden = (tagSelect.value !== 'custom');
  });

  document.getElementById('add-lesson-btn').addEventListener('click', function() {
    openLessonModal(null);
  });

  modal.querySelectorAll('[data-close-lesson-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var editId = fd.get('editId');
    var pit = fd.get('pit').trim();
    var cost = fd.get('cost').trim();
    var lesson = fd.get('lesson').trim();
    var tagRaw = fd.get('tag');
    var tag = tagRaw === 'custom' ? (fd.get('tagCustom') || '').trim() : tagRaw;
    if (!tag) tag = '其他';

    // 持久化新标签
    if (tagRaw === 'custom' && tag) {
      saveLessonTag(tag);
    }

    if (editId) {
      var lessons0 = loadLessons();
      var l0 = lessons0.find(function(x) { return x.id === editId; });
      if (!l0) return;
      l0.pit = pit;
      l0.cost = cost;
      l0.lesson = lesson;
      l0.tag = tag;
      saveLessons(lessons0);
      closeAnyModal(modal);
      renderLessons();
      updateLessonTagFilter();
      showToast('教训已更新', 'success');
    } else {
      var lessonObj = {
        id: uuid(),
        pit: pit,
        cost: cost,
        lesson: lesson,
        tag: tag,
        created: new Date().toISOString(),
        isRecurrence: false,
        recurrenceCount: 0,
      };

      // 先保存
      var lessons1 = loadLessons();
      lessons1.push(lessonObj);
      saveLessons(lessons1);
      closeAnyModal(modal);

      // 复发检测
      var matches = checkLessonRecurrence(pit);
      if (matches.length > 0) {
        // 有疑似复发，弹出警示卡
        showRecurrenceWarning(
          matches,
          // 确实重蹈覆辙
          function() {
            var lessons2 = loadLessons();
            var newL = lessons2.find(function(x) { return x.id === lessonObj.id; });
            if (newL) {
              newL.isRecurrence = true;
              newL.recurrenceCount = (newL.recurrenceCount || 0) + 1;
            }
            // 同时给匹配的历史教训复发计数+1
            matches.forEach(function(m) {
              var oldL = lessons2.find(function(x) { return x.id === m.lesson.id; });
              if (oldL) {
                oldL.recurrenceCount = (oldL.recurrenceCount || 0) + 1;
              }
            });
            saveLessons(lessons2);
            renderLessons();
            updateLessonTagFilter();
            showToast('已标记为复发', 'warning');
          },
          // 不是同一件事
          function() {
            renderLessons();
            updateLessonTagFilter();
            showToast('教训已记录', 'success');
          }
        );
      } else {
        // 无复发
        renderLessons();
        updateLessonTagFilter();
        showToast('教训已记录', 'success');
      }
    }
  });

  document.getElementById('lesson-tag-filter').addEventListener('change', renderLessons);
}

// ============================================================
// 既往也咎 — 月度复盘
// ============================================================

var _currentReviewType = 'day';

function applyReviewTabVisibility() {
  var reviewEnabled = loadJSON('lifeos_review_enabled', true);
  var reviewTab = document.getElementById('tab-review');
  if (reviewTab) {
    reviewTab.classList.toggle('tab--hidden', !reviewEnabled);
  }
  // 如果当前在 review tab 且被关闭，切到 timeline
  if (!reviewEnabled) {
    var activeTab = document.querySelector('.tab--active');
    if (activeTab && activeTab.dataset.tab === 'review') {
      var timelineTab = document.querySelector('.tab[data-tab="timeline"]');
      if (timelineTab) timelineTab.click();
    }
  }
}

var REVIEW_CONFIG = {
  day: {
    title: '日复盘',
    q1Label: '今天做成了什么',
    q2Label: '今天搞砸了什么',
    q3Label: '明天最重要的一件事',
    q3Placeholder: '明天最值得做的一件事…',
    dateLabel: '日期',
    useMonth: false,
    emptyText: '今天还没复盘。睡前花两分钟，照见自己。',
  },
  week: {
    title: '周复盘',
    q1Label: '本周做成了什么',
    q2Label: '本周搞砸了什么',
    q3Label: '下周最重要的一件事',
    q3Placeholder: '下周最值得做的一件事…',
    dateLabel: '本周起始日',
    useMonth: false,
    emptyText: '本周还没复盘。周末花十分钟，看看这一周。',
  },
  month: {
    title: '月复盘',
    q1Label: '这个月做成了什么',
    q2Label: '搞砸了什么',
    q3Label: '下个月最重要的一件事',
    q3Placeholder: '下个月最值得做的一件事…',
    dateLabel: '月份',
    useMonth: true,
    emptyText: '本月还没复盘。每月一次，照见自己。',
  },
};

function renderReviews() {
  var allReviews = loadReviews();
  var type = _currentReviewType;
  var config = REVIEW_CONFIG[type];

  // 过滤当前 type（兼容旧数据无 type 字段的视为 month）
  var reviews = allReviews.filter(function(r) {
    if (!r.type) return type === 'month';
    return r.type === type;
  });

  // 排序
  reviews.sort(function(a, b) {
    var ka = a.month || a.date || '';
    var kb = b.month || b.date || '';
    return kb.localeCompare(ka);
  });

  var list = document.getElementById('review-list');
  list.innerHTML = '';

  // 更新标签
  var labelEl = document.getElementById('review-current-label');
  if (labelEl) {
    if (type === 'month') {
      var now = new Date();
      labelEl.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
    } else if (type === 'week') {
      labelEl.textContent = '本周起始：' + getWeekStart();
    } else {
      labelEl.textContent = todayKey();
    }
  }

  if (reviews.length === 0) {
    list.innerHTML = emptyStateHTML('review', config.emptyText, '', '');
    return;
  }

  reviews.forEach(function(r) {
    var card = document.createElement('div');
    card.className = 'review-card';

    var dateLabel = r.month || r.date || '';
    var q3Text = REVIEW_CONFIG[r.type || 'month'].q3Label;

    card.innerHTML =
      '<div class="review-card__summary">' +
        '<div class="review-card__month">' + escapeHtml(dateLabel) + ' ' + escapeHtml((r.type || 'month') === 'day' ? '日复盘' : (r.type === 'week' ? '周复盘' : '月复盘')) + '</div>' +
        '<span class="review-card__toggle">▼</span>' +
      '</div>' +
      '<div class="review-card__details">' +
        '<div class="review-card__details-inner">' +
          '<div class="review-card__item"><div class="review-card__label">✅ ' + escapeHtml(config.q1Label) + '</div><div class="review-card__text">' + escapeHtml(r.success || '—') + '</div></div>' +
          '<div class="review-card__item"><div class="review-card__label">❌ ' + escapeHtml(config.q2Label) + '</div><div class="review-card__text">' + escapeHtml(r.fail || '—') + '</div></div>' +
          '<div class="review-card__item"><div class="review-card__label">🎯 ' + escapeHtml(config.q3Label) + '</div><div class="review-card__text">' + escapeHtml(r.priority || '—') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="item-actions">' +
        '<button class="item-actions__btn" data-action="edit" data-id="' + r.id + '" type="button">编辑</button>' +
        '<button class="item-actions__btn item-actions__btn--danger" data-action="del" data-id="' + r.id + '" type="button">删除</button>' +
      '</div>';

    // 展开/收起
    var summary = card.querySelector('.review-card__summary');
    summary.addEventListener('click', function(e) {
      if (e.target.closest('.item-actions')) return;
      card.classList.toggle('expanded');
    });

    // 编辑/删除
    card.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        if (action === 'edit') {
          openReviewModal(r.id);
        } else if (action === 'del') {
          var deleted = r;
          confirmDelete('删除复盘', '确定删除这条复盘记录？', function() {
            saveReviews(loadReviews().filter(function(x) { return x.id !== r.id; }));
            renderReviews();
            showToast('复盘已删除', 'success', {
              undo: function() {
                var rv = loadReviews();
                rv.push(deleted);
                saveReviews(rv);
                renderReviews();
              }
            });
          });
        }
      });
    });

    list.appendChild(card);
  });
}

function getWeekStart() {
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var day = now.getDay();
  if (day === 0) day = 7; // 周日=7
  now.setDate(now.getDate() - day + 1);
  return formatDate(now.toISOString());
}

function openReviewModal(editId) {
  var modal = document.getElementById('review-modal');
  var form = document.getElementById('review-form');
  var titleEl = document.getElementById('review-modal-title');
  var submitBtn = document.getElementById('review-submit-btn');
  var editIdEl = document.getElementById('review-edit-id');
  var typeHidden = document.getElementById('review-type-hidden');
  var dateField = document.getElementById('review-date-field');
  var monthField = document.getElementById('review-month-field');
  var dateInput = document.getElementById('review-date-input');
  var monthInput = document.getElementById('review-month-input');
  var dateLabel = document.getElementById('review-date-label');
  var q1Label = document.getElementById('review-q1-label');
  var q2Label = document.getElementById('review-q2-label');
  var q3Label = document.getElementById('review-q3-label');

  form.reset();

  if (editId) {
    var reviews = loadReviews();
    var r = reviews.find(function(x) { return x.id === editId; });
    if (!r) return;
    var rType = r.type || 'month';
    var config = REVIEW_CONFIG[rType];
    titleEl.textContent = '编辑' + config.title;
    submitBtn.textContent = '保存';
    editIdEl.value = editId;
    typeHidden.value = rType;

    // 切换日期/月份字段
    if (config.useMonth) {
      dateField.hidden = true;
      monthField.hidden = false;
      monthInput.value = r.month || '';
      monthInput.required = true;
      dateInput.required = false;
    } else {
      dateField.hidden = false;
      monthField.hidden = true;
      dateInput.value = r.date || todayKey();
      dateInput.required = true;
      monthInput.required = false;
    }

    q1Label.textContent = config.q1Label;
    q2Label.textContent = config.q2Label;
    q3Label.textContent = config.q3Label;
    dateLabel.textContent = config.dateLabel;

    form.querySelector('[name="success"]').value = r.success || '';
    form.querySelector('[name="fail"]').value = r.fail || '';
    form.querySelector('[name="priority"]').value = r.priority || '';
  } else {
    var type = _currentReviewType;
    var config2 = REVIEW_CONFIG[type];
    titleEl.textContent = '新建' + config2.title;
    submitBtn.textContent = '保存';
    editIdEl.value = '';
    typeHidden.value = type;

    if (config2.useMonth) {
      dateField.hidden = true;
      monthField.hidden = false;
      var now = new Date();
      monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      monthInput.required = true;
      dateInput.required = false;
    } else {
      dateField.hidden = false;
      monthField.hidden = true;
      dateInput.value = type === 'week' ? getWeekStart() : todayKey();
      dateInput.required = true;
      monthInput.required = false;
    }

    q1Label.textContent = config2.q1Label;
    q2Label.textContent = config2.q2Label;
    q3Label.textContent = config2.q3Label;
    dateLabel.textContent = config2.dateLabel;
  }

  modal.hidden = false;
  trapFocus(modal);
}

function initReviewModal() {
  var modal = document.getElementById('review-modal');
  var form = document.getElementById('review-form');

  // 复盘设置齿轮
  var settingsBtn = document.getElementById('review-settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      var reviewEnabled = loadJSON('lifeos_review_enabled', true);
      var modal2 = document.getElementById('confirm-modal');
      var titleEl = document.getElementById('confirm-title');
      var descEl = document.getElementById('confirm-desc');
      var actionsEl = modal2.querySelector('.confirm-modal__actions');

      titleEl.textContent = '复盘设置';
      descEl.innerHTML = reviewEnabled ?
        '复盘功能当前已开启。是否关闭复盘Tab？<br><span style="color:var(--t-3);font-size:12px">关闭后数据保留不删，随时可重新开启</span>' :
        '复盘功能当前已关闭。是否重新开启？';

      actionsEl.innerHTML = '';
      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn--primary';
      toggleBtn.textContent = reviewEnabled ? '关闭复盘' : '开启复盘';
      toggleBtn.addEventListener('click', function() {
        var newState = !reviewEnabled;
        saveJSON('lifeos_review_enabled', newState);
        applyReviewTabVisibility();
        closeAnyModal(modal2);
        restoreConfirmActions();
        showToast(newState ? '复盘已开启' : '复盘已关闭', 'success');
      });

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--ghost';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', function() {
        closeAnyModal(modal2);
        restoreConfirmActions();
      });

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(toggleBtn);
      modal2.hidden = false;
    });
  }

  // 初始应用复盘 Tab 可见性
  applyReviewTabVisibility();

  // 复盘子标签切换
  document.querySelectorAll('.review-subtab').forEach(function(subtab) {
    subtab.addEventListener('click', function() {
      document.querySelectorAll('.review-subtab').forEach(function(s) { s.classList.remove('review-subtab--active'); });
      subtab.classList.add('review-subtab--active');
      _currentReviewType = subtab.dataset.rtype;
      renderReviews();
    });
  });

  document.getElementById('add-review-btn').addEventListener('click', function() {
    var type = _currentReviewType;
    var reviews = loadReviews();
    var existing = null;

    if (type === 'month') {
      var now = new Date();
      var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      existing = reviews.find(function(r) { return (r.type || 'month') === 'month' && r.month === currentMonth; });
    } else if (type === 'day') {
      existing = reviews.find(function(r) { return r.type === 'day' && r.date === todayKey(); });
    } else if (type === 'week') {
      var ws = getWeekStart();
      existing = reviews.find(function(r) { return r.type === 'week' && r.date === ws; });
    }

    if (existing) {
      showToast('已存在，正在打开编辑', 'warning');
      openReviewModal(existing.id);
    } else {
      openReviewModal(null);
    }
  });

  modal.querySelectorAll('[data-close-review-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var editId = fd.get('editId');
    var type = fd.get('type') || 'day';
    var success = (fd.get('success') || '').trim();
    var fail = (fd.get('fail') || '').trim();
    var priority = (fd.get('priority') || '').trim();

    // 根据 type 获取日期/月份
    var dateVal = null, monthVal = null;
    if (REVIEW_CONFIG[type].useMonth) {
      monthVal = fd.get('month') || '';
    } else {
      dateVal = fd.get('date') || '';
    }

    if (editId) {
      var reviews0 = loadReviews();
      var r0 = reviews0.find(function(x) { return x.id === editId; });
      if (!r0) return;
      r0.type = type;
      r0.date = dateVal;
      r0.month = monthVal;
      r0.success = success;
      r0.fail = fail;
      r0.priority = priority;
      saveReviews(reviews0);
      closeAnyModal(modal);
      renderReviews();
      showToast('复盘已更新', 'success');
    } else {
      var review = {
        id: uuid(),
        type: type,
        date: dateVal,
        month: monthVal,
        success: success,
        fail: fail,
        priority: priority,
      };
      var reviews1 = loadReviews();
      reviews1.push(review);
      saveReviews(reviews1);
      closeAnyModal(modal);
      renderReviews();
      showToast('复盘已保存', 'success');
    }
  });
}

// ============================================================
// 时光胶囊
// ============================================================

var STORAGE_CAPSULES = 'lifeos_capsules';

function loadCapsules() { return loadJSON(STORAGE_CAPSULES, []); }
function saveCapsules(c) { saveJSON(STORAGE_CAPSULES, c); }

function renderCapsules() {
  var capsules = loadCapsules().sort(function(a, b) {
    return (b.unlockDate || '').localeCompare(a.unlockDate || '');
  });
  var list = document.getElementById('capsule-list');
  list.innerHTML = '';

  if (capsules.length === 0) {
    list.innerHTML = emptyStateHTML('review', '还没有时光胶囊。写一封给未来的信，封存此刻的心意。', '', '');
    return;
  }

  var today = todayKey();

  capsules.forEach(function(c) {
    var isUnlocked = c.unlockDate <= today;
    var card = document.createElement('div');
    card.className = 'capsule-card ' + (isUnlocked ? 'capsule-card--unlocked' : 'capsule-card--locked');

    var statusHtml = isUnlocked ?
      '<span class="capsule-card__status capsule-card__status--unlocked">已解锁</span>' :
      '<span class="capsule-card__status capsule-card__status--locked">🔒 封存中</span>';

    var metaText = '写于 ' + (c.createdDate || '') + ' · 解锁日 ' + (c.unlockDate || '');

    var countdownHtml = '';
    if (!isUnlocked && c.unlockDate) {
      var days = daysBetween(today, c.unlockDate);
      if (days > 0) {
        countdownHtml = '<p class="capsule-card__countdown">还有 ' + days + ' 天解锁</p>';
      }
    }

    card.innerHTML =
      '<div class="capsule-card__header">' +
        '<span class="capsule-card__title">' + escapeHtml(c.title) + '</span>' +
        statusHtml +
      '</div>' +
      '<p class="capsule-card__meta">' + escapeHtml(metaText) + '</p>' +
      countdownHtml +
      '<div class="item-actions">' +
        (isUnlocked ? '<button class="item-actions__btn" data-action="view" data-id="' + c.id + '" type="button">查看</button>' : '') +
        '<button class="item-actions__btn" data-action="del" data-id="' + c.id + '" type="button">删除</button>' +
      '</div>';

    card.addEventListener('click', function(e) {
      if (e.target.closest('.item-actions')) return;
      if (isUnlocked) {
        openCapsuleView(c.id);
      } else {
        showToast('胶囊还没到解锁日期', 'warning');
      }
    });

    card.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        if (action === 'view') {
          openCapsuleView(c.id);
        } else if (action === 'del') {
          var deleted = c;
          confirmDelete('删除时光胶囊', '确定删除「' + c.title + '」？此操作不可撤销。', function() {
            saveCapsules(loadCapsules().filter(function(x) { return x.id !== c.id; }));
            renderCapsules();
            showToast('胶囊已删除', 'success', {
              undo: function() {
                var cs = loadCapsules();
                cs.push(deleted);
                saveCapsules(cs);
                renderCapsules();
              }
            });
          });
        }
      });
    });

    list.appendChild(card);
  });
}

function openCapsuleModal() {
  var modal = document.getElementById('capsule-modal');
  var form = document.getElementById('capsule-form');
  form.reset();
  document.getElementById('capsule-edit-id').value = '';

  // 默认解锁日期：30天后
  var defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  form.querySelector('[name="unlockDate"]').value = formatDate(defaultDate.toISOString());
  // 最小解锁日期：明天
  var minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  form.querySelector('[name="unlockDate"]').min = formatDate(minDate.toISOString());

  modal.hidden = false;
  trapFocus(modal);
}

function openCapsuleView(id) {
  var capsules = loadCapsules();
  var c = capsules.find(function(x) { return x.id === id; });
  if (!c) return;

  var modal = document.getElementById('capsule-view-modal');
  var content = document.getElementById('capsule-view-content');

  var today = todayKey();
  var isUnlocked = c.unlockDate <= today;

  if (!isUnlocked) {
    content.innerHTML =
      '<div class="capsule-view__locked">' +
        '<div class="capsule-view__locked-icon">🔒</div>' +
        '<p>这封信还没到解锁日期</p>' +
        '<p style="font-size:12px;color:var(--t-3);margin-top:var(--s-2)">解锁日：' + escapeHtml(c.unlockDate) + '</p>' +
      '</div>';
  } else {
    content.innerHTML =
      '<div class="capsule-view__title">' + escapeHtml(c.title) + '</div>' +
      '<div class="capsule-view__meta">写于 ' + escapeHtml(c.createdDate || '') + ' · 解锁日 ' + escapeHtml(c.unlockDate) + '</div>' +
      '<div class="capsule-view__content">' + escapeHtml(c.content) + '</div>' +
      '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-capsule-view>关闭</button>' +
      '</div>';
  }

  modal.hidden = false;
  trapFocus(modal);

  modal.querySelectorAll('[data-close-capsule-view]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });
}

function initCapsuleModal() {
  var modal = document.getElementById('capsule-modal');
  var form = document.getElementById('capsule-form');

  document.getElementById('add-capsule-btn').addEventListener('click', function() {
    openCapsuleModal();
  });

  modal.querySelectorAll('[data-close-capsule-modal]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm(form)) return;

    var fd = new FormData(form);
    var title = (fd.get('title') || '').trim();
    var content = (fd.get('content') || '').trim();
    var unlockDate = fd.get('unlockDate');

    var capsule = {
      id: uuid(),
      title: title,
      content: content,
      unlockDate: unlockDate,
      createdDate: todayKey(),
    };

    var capsules = loadCapsules();
    capsules.push(capsule);
    saveCapsules(capsules);

    closeAnyModal(modal);
    renderCapsules();
    showToast('时光胶囊已封存', 'success');
  });
}

// ============================================================
// 统计页
// ============================================================

function renderStats() {
  renderStatsOverview();
  renderHeatmap();
  renderLifeKLine();
  renderRankList();
}

// ---- 数字总览 ----
function renderStatsOverview() {
  var goals = loadGoals();
  var activeGoals = goals.filter(function(g) { return !g.completed; });
  var completedGoals = goals.filter(function(g) { return g.completed; });

  // 总打卡次数
  var totalCheckins = 0;
  goals.forEach(function(g) {
    if (g.checkins) totalCheckins += g.checkins.length;
  });

  // 当前最长连续打卡天数（所有目标中取最大值）
  var maxStreak = 0;
  goals.forEach(function(g) {
    var s = calcStreak(g.checkins || []);
    if (s > maxStreak) maxStreak = s;
  });

  var nobleCount = loadNoble().length;
  var lessonCount = loadLessons().length;

  var cards = [
    { value: activeGoals.length, label: '进行中目标' },
    { value: completedGoals.length, label: '已完成目标' },
    { value: totalCheckins, label: '总打卡次数' },
    { value: maxStreak, label: '最长连续天数' },
    { value: nobleCount, label: '贵人数' },
    { value: lessonCount, label: '教训数' },
  ];

  var html = cards.map(function(c) {
    return '<div class="stat-card">' +
      '<div class="stat-card__value">' + c.value + '</div>' +
      '<div class="stat-card__label">' + escapeHtml(c.label) + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('stats-overview').innerHTML = html;
}

// ---- 打卡热力图（52周 × 7天）----
function renderHeatmap() {
  var goals = loadGoals();
  // 汇总所有打卡日期 → 次数
  var dayCount = {};
  goals.forEach(function(g) {
    (g.checkins || []).forEach(function(c) {
      if (c.date) {
        dayCount[c.date] = (dayCount[c.date] || 0) + 1;
      }
    });
  });

  // 找最大值用于分级
  var maxCount = 0;
  Object.keys(dayCount).forEach(function(k) {
    if (dayCount[k] > maxCount) maxCount = dayCount[k];
  });

  // 计算热力图日期范围：以今天为终点，向前推52周（364天），对齐到周日开始
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // 今天是星期几（0=周日）
  var todayDow = today.getDay();

  // 热力图起始日 = 今天 - (51*7 + todayDow) 天，即从本周日往前推51周
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (51 * 7 + todayDow));

  // 生成 52*7 = 364 个格子
  var cells = [];
  var monthLabels = [];
  var lastMonth = -1;

  for (var week = 0; week < 52; week++) {
    // 月份标签
    var firstDayOfWeek = new Date(startDate);
    firstDayOfWeek.setDate(firstDayOfWeek.getDate() + week * 7);
    var monthIdx = firstDayOfWeek.getMonth();
    if (monthIdx !== lastMonth && firstDayOfWeek.getDate() <= 7) {
      monthLabels.push({ week: week, label: (firstDayOfWeek.getMonth() + 1) + '月' });
      lastMonth = monthIdx;
    }

    for (var dow = 0; dow < 7; dow++) {
      var cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + week * 7 + dow);
      var dateKey = formatDate(cellDate.toISOString());

      // 只显示到今天为止的格子
      if (cellDate > today) {
        cells.push({ date: dateKey, count: -1, level: -1, future: true });
      } else {
        var count = dayCount[dateKey] || 0;
        var level = 0;
        if (count > 0) {
          if (maxCount > 0) {
            var ratio = count / maxCount;
            if (ratio <= 0.25) level = 1;
            else if (ratio <= 0.50) level = 2;
            else if (ratio <= 0.75) level = 3;
            else level = 4;
          } else {
            level = 1;
          }
        }
        var tooltip = (cellDate.getMonth() + 1) + '月' + cellDate.getDate() + '日 打卡' + count + '次';
        cells.push({ date: dateKey, count: count, level: level, tooltip: tooltip, future: false });
      }
    }
  }

  // 构建 HTML
  var html = '';

  // 月份标签
  html += '<div class="heatmap-months">';
  for (var w = 0; w < 52; w++) {
    var label = '';
    for (var mi = 0; mi < monthLabels.length; mi++) {
      if (monthLabels[mi].week === w) { label = monthLabels[mi].label; break; }
    }
    html += '<span>' + label + '</span>';
  }
  html += '</div>';

  // 热力图格子
  html += '<div class="heatmap">';
  cells.forEach(function(cell) {
    if (cell.future) {
      html += '<div class="heatmap-cell" style="background:transparent"></div>';
    } else {
      html += '<div class="heatmap-cell heatmap-cell--' + cell.level + '" data-tooltip="' + escapeHtml(cell.tooltip) + '"></div>';
    }
  });
  html += '</div>';

  document.getElementById('heatmap-wrap').innerHTML = html;
}

// ---- 人生K线图 ----
// 严格规则：每日心境分 D(t) 机械化构造
//   基础分（来自每日一句 mood）：高光=+2，平凡=0，低谷=-2；转折不计基础分
//   事件修正（来自时间线 mood）：每个高光节点+1，每个低谷节点-1，叠加后截断 [-3,+3]
//   当日无任何记录 → 缺失值（不记0），该月无任何记录则不生成K线
var _klineData = []; // 缓存K线数据供交互使用

function renderLifeKLine() {
  var canvas = document.getElementById('kline-canvas');
  var emptyEl = document.getElementById('kline-empty');
  if (!canvas) return;

  // ---- Step 1: 收集每日记录 ----
  var dailies = loadDaily();
  var timeline = loadTimeline();

  // 按 dateKey(YYYY-MM-DD) 聚合
  var dayMap = {}; // dateKey -> { dailyMood, timelineEntries: [] }

  dailies.forEach(function(d) {
    if (!d.date) return;
    if (!dayMap[d.date]) dayMap[d.date] = { timelineEntries: [] };
    dayMap[d.date].dailyMood = d.mood;
  });

  timeline.forEach(function(t) {
    if (!t.date) return;
    if (!dayMap[t.date]) dayMap[t.date] = { timelineEntries: [] };
    dayMap[t.date].timelineEntries.push({ mood: t.mood, title: t.title });
  });

  // ---- Step 2: 计算每日 D(t) ----
  var dailyD = {}; // dateKey -> { D, highlightTitles: [], lowTitles: [], hasTurning: bool }

  Object.keys(dayMap).forEach(function(dateKey) {
    var day = dayMap[dateKey];
    var D = null; // null = 缺失

    // 基础分：仅每日一句 mood
    if (day.dailyMood) {
      if (day.dailyMood === 'highlight') D = 2;
      else if (day.dailyMood === 'low') D = -2;
      else if (day.dailyMood === 'ordinary') D = 0;
      // turning 不计基础分 → D 保持 null
    }

    // 事件修正：时间线节点
    var highlightTitles = [];
    var lowTitles = [];
    var hasTurning = false;

    day.timelineEntries.forEach(function(te) {
      if (te.mood === 'highlight') {
        if (D === null) D = 0; // 有时间线修正但无基础分，从0开始
        D += 1;
        if (te.title) highlightTitles.push(te.title);
      } else if (te.mood === 'low') {
        if (D === null) D = 0;
        D -= 1;
        if (te.title) lowTitles.push(te.title);
      } else if (te.mood === 'turning') {
        hasTurning = true;
      } else if (te.mood === 'ordinary') {
        // 平凡时间线节点不影响分值
      }
    });

    // 如果 D 仍为 null（无每日一句且无高光/低谷时间线），但有平凡/转折记录
    // 则 D = 0（有记录但中性）
    if (D === null && day.timelineEntries.length > 0) {
      D = 0;
    }

    // D 为 null → 缺失日，不存入
    if (D !== null) {
      // 截断到 [-3, +3]
      D = Math.max(-3, Math.min(3, D));
      dailyD[dateKey] = {
        D: D,
        highlightTitles: highlightTitles,
        lowTitles: lowTitles,
        hasTurning: hasTurning,
      };
    }
  });

  // ---- Step 3: 按月聚合 OHLC ----
  var monthMap = {}; // 'YYYY-MM' -> [{ dateKey, D, highlightTitles, lowTitles, hasTurning }, ...]

  Object.keys(dailyD).forEach(function(dateKey) {
    var month = dateKey.substring(0, 7);
    if (!monthMap[month]) monthMap[month] = [];
    var d = dailyD[dateKey];
    monthMap[month].push({
      dateKey: dateKey,
      D: d.D,
      highlightTitles: d.highlightTitles,
      lowTitles: d.lowTitles,
      hasTurning: d.hasTurning,
    });
  });

  var months = Object.keys(monthMap).sort();
  _klineData = months.map(function(month) {
    var entries = monthMap[month].sort(function(a, b) { return a.dateKey < b.dateKey ? -1 : 1; });
    var dValues = entries.map(function(e) { return e.D; });
    var open = dValues[0];
    var close = dValues[dValues.length - 1];
    var high = Math.max.apply(null, dValues);
    var low = Math.min.apply(null, dValues);

    // 当月所有高光/低谷事件标题
    var highlightTitles = [];
    var lowTitles = [];
    var turningCount = 0;
    entries.forEach(function(e) {
      highlightTitles = highlightTitles.concat(e.highlightTitles);
      lowTitles = lowTitles.concat(e.lowTitles);
      if (e.hasTurning) turningCount++;
    });

    return {
      month: month,
      open: open,
      close: close,
      high: high,
      low: low,
      highlightTitles: highlightTitles,
      lowTitles: lowTitles,
      turningCount: turningCount,
      entryCount: entries.length,
    };
  });

  // ---- Step 4: 数据不足2个月 → 空状态 ----
  if (_klineData.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = '先记两周每日一句，你的第一根K线就会长出来';
    }
    var detail0 = document.getElementById('kline-detail');
    if (detail0) detail0.innerHTML = '<p class="kline-detail__hint">点击某根K线查看当月摘要</p>';
    return;
  }

  canvas.style.display = 'block';
  if (emptyEl) emptyEl.hidden = true;

  // ---- Step 5: Canvas 绘制 ----
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.offsetWidth;
  var h = 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  var n = _klineData.length;
  var padL = 16, padR = 16, padT = 16, padB = 28;
  var chartW = w - padL - padR;
  var chartH = h - padT - padB;

  // Y轴范围：[-3, +3]
  var yMin = -3, yMax = 3;
  var yToPx = function(val) { return padT + chartH * (1 - (val - yMin) / (yMax - yMin)); };

  // 仅画 0 轴虚线（不显示数值刻度）
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  var yZero = yToPx(0);
  ctx.beginPath();
  ctx.moveTo(padL, yZero);
  ctx.lineTo(w - padR, yZero);
  ctx.stroke();
  ctx.setLineDash([]);

  // 计算K线宽度
  var candleW = Math.max(4, Math.min(20, chartW / n * 0.55));
  var gap = chartW / n;

  // 绘制每根K线
  _klineData.forEach(function(k, i) {
    var cx = padL + gap * (i + 0.5);
    var yOpen = yToPx(k.open);
    var yClose = yToPx(k.close);
    var yHigh = yToPx(k.high);
    var yLow = yToPx(k.low);

    var isUp = k.close > k.open;
    var isDown = k.close < k.open;
    var isFlat = k.close === k.open;

    var color;
    if (isUp) color = '#fbbf24';       // 金色阳线
    else if (isDown) color = '#6b7c93'; // 蓝灰阴线
    else color = '#9ca3af';             // 一字线 — 中性灰

    // 影线 — 转折节点加粗一级
    var wickWidth = 1;
    if (k.turningCount > 0) wickWidth = 1 + Math.min(k.turningCount, 2); // 每个转折+1，最多+2

    ctx.strokeStyle = color;
    ctx.lineWidth = wickWidth;
    ctx.beginPath();
    ctx.moveTo(cx, yHigh);
    ctx.lineTo(cx, yLow);
    ctx.stroke();

    // 实体
    if (isFlat) {
      // 一字线：画一条短横线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - candleW / 2, yOpen);
      ctx.lineTo(cx + candleW / 2, yOpen);
      ctx.stroke();
    } else {
      var bodyTop = Math.min(yOpen, yClose);
      var bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);
    }
  });

  // X轴月份标签（稀疏显示）
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  var labelStep = Math.ceil(n / 8);
  _klineData.forEach(function(k, i) {
    if (i % labelStep === 0 || i === n - 1) {
      var cx = padL + gap * (i + 0.5);
      var parts = k.month.split('-');
      ctx.fillText(parts[1] + '月', cx, h - 8);
    }
  });

  // ---- Step 6: 交互（点击） ----
  var newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  canvas = newCanvas;

  function getKlineAtX(x) {
    var idx = Math.floor((x - padL) / gap);
    if (idx >= 0 && idx < _klineData.length) return idx;
    return -1;
  }

  function showDetail(idx) {
    if (idx < 0 || idx >= _klineData.length) return;
    var k = _klineData[idx];
    var detail = document.getElementById('kline-detail');
    if (!detail) return;

    var isUp = k.close > k.open;
    var isDown = k.close < k.open;
    var statClass = isUp ? '--up' : (isDown ? '--down' : '--flat');

    var html = '<div class="kline-detail__month">' + k.month + ' 月度摘要</div>';
    html += '<div class="kline-detail__stats">';
    html += '<span class="kline-detail__stat' + statClass + '">开: <span>' + k.open + '</span></span>';
    html += '<span class="kline-detail__stat' + statClass + '">收: <span>' + k.close + '</span></span>';
    html += '<span class="kline-detail__stat">高: <span>' + k.high + '</span></span>';
    html += '<span class="kline-detail__stat">低: <span>' + k.low + '</span></span>';
    html += '<span class="kline-detail__stat">记录: <span>' + k.entryCount + ' 天</span></span>';
    html += '</div>';

    // 高光事件标题
    if (k.highlightTitles.length > 0) {
      k.highlightTitles.forEach(function(t) {
        html += '<div class="kline-detail__event kline-detail__event--highlight">★ ' + escapeHtml(t) + '</div>';
      });
    }
    // 低谷事件标题
    if (k.lowTitles.length > 0) {
      k.lowTitles.forEach(function(t) {
        html += '<div class="kline-detail__event kline-detail__event--low">▼ ' + escapeHtml(t) + '</div>';
      });
    }
    // 转折提示
    if (k.turningCount > 0) {
      html += '<div class="kline-detail__turning">⚡ 含 ' + k.turningCount + ' 个转折节点（影线已加粗）</div>';
    }

    detail.innerHTML = html;
  }

  canvas.addEventListener('click', function(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var idx = getKlineAtX(x);
    if (idx >= 0) showDetail(idx);
  });

  canvas.addEventListener('touchstart', function(e) {
    if (e.touches.length > 0) {
      var rect = canvas.getBoundingClientRect();
      var x = e.touches[0].clientX - rect.left;
      var idx = getKlineAtX(x);
      if (idx >= 0) showDetail(idx);
    }
  });
}

// ---- 目标进度排行 ----
function renderRankList() {
  var goals = loadGoals().filter(function(g) { return !g.completed; });
  var listEl = document.getElementById('rank-list');

  if (goals.length === 0) {
    listEl.innerHTML = emptyStateHTML('goal', '还没有进行中的目标。', '', '');
    return;
  }

  // 按进度降序
  goals.sort(function(a, b) {
    return calcProgress(b) - calcProgress(a);
  });

  var html = goals.map(function(g) {
    var progress = calcProgress(g);
    var pct = Math.round(progress * 100);
    return '<div class="rank-item">' +
      '<div class="rank-item__name" title="' + escapeHtml(g.name) + '">' + escapeHtml(g.name) + '</div>' +
      '<div class="rank-item__bar"><div class="rank-item__bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="rank-item__pct">' + pct + '%</div>' +
    '</div>';
  }).join('');

  listEl.innerHTML = html;
}

// ============================================================
// 智能提醒横幅
// ============================================================

function getReadReminders() {
  return loadJSON(STORAGE_REMINDERS_READ, {});
}

function markReminderRead(type) {
  var read = getReadReminders();
  var key = todayKey() + '_' + type;
  read[key] = true;
  saveJSON(STORAGE_REMINDERS_READ, read);
}

function isReminderRead(type) {
  var read = getReadReminders();
  return !!read[todayKey() + '_' + type];
}

function showReminderBanner(type, icon, text, actionLabel, onAction) {
  if (isReminderRead(type)) return;

  var stack = document.getElementById('reminder-stack');
  if (!stack) return;

  // 避免重复
  if (stack.querySelector('[data-reminder-type="' + type + '"]')) return;

  var banner = document.createElement('div');
  banner.className = 'reminder-banner';
  banner.dataset.reminderType = type;

  var html = '';
  if (icon) html += '<span class="reminder-banner__icon">' + icon + '</span>';
  html += '<span class="reminder-banner__text">' + escapeHtml(text) + '</span>';
  if (actionLabel) {
    html += '<button class="reminder-banner__action" type="button">' + escapeHtml(actionLabel) + '</button>';
  }
  html += '<button class="reminder-banner__close" type="button" aria-label="关闭">✕</button>';

  banner.innerHTML = html;
  stack.appendChild(banner);

  // 关闭按钮
  banner.querySelector('.reminder-banner__close').addEventListener('click', function() {
    dismissReminder(banner, type);
  });

  // 动作按钮
  var actionBtn = banner.querySelector('.reminder-banner__action');
  if (actionBtn && onAction) {
    actionBtn.addEventListener('click', function() {
      dismissReminder(banner, type);
      onAction();
    });
  }

  // 5秒自动淡出
  var timer = setTimeout(function() {
    dismissReminder(banner, type);
  }, 5000);

  banner._timer = timer;

  // hover 暂停自动关闭
  banner.addEventListener('mouseenter', function() {
    clearTimeout(banner._timer);
  });
  banner.addEventListener('mouseleave', function() {
    banner._timer = setTimeout(function() {
      dismissReminder(banner, type);
    }, 2000);
  });
}

function dismissReminder(banner, type) {
  if (!banner || !banner.parentNode) return;
  clearTimeout(banner._timer);
  markReminderRead(type);
  banner.classList.add('reminder--fadeout');
  setTimeout(function() {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
  }, 400);
}

function checkReminders() {
  // 1. 今日未打卡任何进行中目标
  var goals = loadGoals().filter(function(g) { return !g.completed; });
  var todayHasCheckin = false;
  var today = todayKey();
  goals.forEach(function(g) {
    (g.checkins || []).forEach(function(c) {
      if (c.date === today) todayHasCheckin = true;
    });
  });
  if (!todayHasCheckin && goals.length > 0) {
    showReminderBanner('checkin', '🔥', '今天还没有打卡，别让连续记录断了', '去打卡', function() {
      switchView('goals');
    });
  }

  // 2. 有贵人今天过生日
  var nobles = loadNoble();
  nobles.forEach(function(n) {
    if (!n.birthday) return;
    var bdDays = daysToBirthday(n.birthday);
    if (bdDays !== null && bdDays === 0) {
      showReminderBanner('birthday_' + n.id, '🎂', '今天是 ' + n.name + ' 的生日 🎂', null, null);
    }
  });

  // 3. 本月无复盘且已是月末最后3天
  var now = new Date();
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var daysLeft = lastDay - now.getDate();
  if (daysLeft <= 2 && daysLeft >= 0) {
    var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var reviews = loadReviews();
    var hasThisMonth = reviews.some(function(r) { return r.month === currentMonth; });
    if (!hasThisMonth) {
      showReminderBanner('review', '📝', '该写本月复盘了', '去写', function() {
        switchView('past');
        // 切换到复盘 Tab
        setTimeout(function() {
          var reviewTab = document.querySelector('.tab[data-tab="review"]');
          if (reviewTab) reviewTab.click();
        }, 200);
      });
    }
  }
}

// ============================================================
// 首页「今日」面板
// ============================================================

function renderTodayPanel() {
  var panel = document.getElementById('today-panel');
  if (!panel) return;

  var now = new Date();
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var dateStr = (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + weekdays[now.getDay()];

  var html = '';
  html += '<div class="today-panel__date">' + dateStr + '</div>';

  var hasAnyContent = false;

  // 1. 今日待打卡
  var goals = loadGoals().filter(function(g) { return !g.completed; });
  if (goals.length > 0) {
    hasAnyContent = true;
    var today = todayKey();
    var unchecked = [];
    goals.forEach(function(g) {
      var checkedToday = (g.checkins || []).some(function(c) { return c.date === today; });
      if (!checkedToday) unchecked.push(g);
    });

    html += '<div class="today-panel__section">';
    html += '<div class="today-panel__section-title">今日待打卡</div>';
    if (unchecked.length === 0) {
      html += '<div class="today-panel__done-text">今日目标全部打卡 ✓</div>';
    } else {
      html += '<div class="today-panel__chips">';
      unchecked.forEach(function(g) {
        var pct = Math.round(calcProgress(g) * 100);
        html += '<button class="today-chip" data-goal-id="' + g.id + '" type="button">' +
          escapeHtml(g.name) + '<span class="today-chip__pct">' + pct + '%</span></button>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // 2. 近期生日（7天内）
  var nobles = loadNoble();
  var upcomingBirthdays = [];
  nobles.forEach(function(n) {
    if (!n.birthday) return;
    var d = daysToBirthday(n.birthday);
    if (d !== null && d <= 7) {
      upcomingBirthdays.push({ name: n.name, days: d });
    }
  });
  if (upcomingBirthdays.length > 0) {
    hasAnyContent = true;
    upcomingBirthdays.sort(function(a, b) { return a.days - b.days; });
    html += '<div class="today-panel__section">';
    html += '<div class="today-panel__section-title">近期生日</div>';
    html += '<div class="today-panel__birthday">';
    upcomingBirthdays.forEach(function(b) {
      var label = b.days === 0 ? '🎂 ' + b.name + ' 今天' : b.name + ' 还有' + b.days + '天';
      html += '<span class="today-birthday-item">' + escapeHtml(label) + '</span>';
    });
    html += '</div></div>';
  }

  // 3. 本月复盘
  var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var reviews = loadReviews();
  var hasThisMonth = reviews.some(function(r) { return r.month === currentMonth; });
  hasAnyContent = true; // 复盘区块始终显示
  html += '<div class="today-panel__section">';
  html += '<div class="today-panel__section-title">本月复盘</div>';
  if (hasThisMonth) {
    html += '<div class="today-panel__review-done">本月复盘已完成 ✓</div>';
  } else {
    html += '<span class="today-panel__review-link" id="today-review-link">本月复盘还没写，去写</span>';
  }
  html += '</div>';

  if (!hasAnyContent) {
    panel.innerHTML = '<div class="today-panel__date">' + dateStr + '</div>';
  } else {
    panel.innerHTML = html;
  }

  // 绑定 chip 点击 → 打开目标详情
  panel.querySelectorAll('.today-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var gid = chip.dataset.goalId;
      switchView('goals');
      setTimeout(function() { openGoalDetail(gid); }, 200);
    });
  });

  // 绑定复盘链接
  var reviewLink = document.getElementById('today-review-link');
  if (reviewLink) {
    reviewLink.addEventListener('click', function() {
      switchView('past');
      setTimeout(function() {
        var reviewTab = document.querySelector('.tab[data-tab="review"]');
        if (reviewTab) reviewTab.click();
      }, 200);
    });
  }
}

// ============================================================
// 每日一句
// ============================================================

function loadDaily() { return loadJSON(STORAGE_DAILY, []); }
function saveDaily(d) { saveJSON(STORAGE_DAILY, d); }

var _dailyMood = 'ordinary';

function renderDaily() {
  renderDailyInput();
  renderDailyList();
}

function renderDailyInput() {
  var area = document.getElementById('daily-input-area');
  var today = todayKey();
  var daily = loadDaily();
  var todayEntry = daily.find(function(d) { return d.date === today; });

  var moodOptions = [
    { key: 'highlight', label: '高光' },
    { key: 'low',       label: '低谷' },
    { key: 'turning',   label: '转折' },
    { key: 'ordinary',  label: '平凡' },
  ];

  var html = '';

  if (todayEntry) {
    _dailyMood = todayEntry.mood || 'ordinary';
    html += '<div class="daily-edit-hint">今天已记一句，修改后覆盖</div>';
  } else {
    _dailyMood = 'ordinary';
  }

  html += '<div class="daily-input-row">';
  html += '  <div class="field">';
  html += '    <span class="field__label">' + (todayEntry ? '编辑今天的句子' : '今天的一句话') + '</span>';
  html += '    <input type="text" id="daily-text-input" class="field__input" placeholder="记下此刻的所思所感…" maxlength="140" value="' + escapeHtml(todayEntry ? todayEntry.text : '') + '">';
  html += '  </div>';
  html += '  <button class="btn btn--primary btn--small" id="daily-save-btn" type="button">' + (todayEntry ? '更新' : '记下') + '</button>';
  html += '</div>';

  // 心情选择
  html += '<div class="daily-mood-picker">';
  html += '<span class="daily-mood-picker__label">心情</span>';
  moodOptions.forEach(function(m) {
    var active = m.key === _dailyMood ? ' active' : '';
    html += '<button class="daily-mood-btn' + active + '" data-mood="' + m.key + '" type="button">';
    html += '<span class="mood-dot mood-dot--' + m.key + '"></span>' + m.label;
    html += '</button>';
  });
  html += '</div>';

  // 字数提示
  html += '<div class="daily-input-hint"><span>限140字</span><span id="daily-char-count">0/140</span></div>';

  area.innerHTML = html;

  // 字数
  var input = document.getElementById('daily-text-input');
  var charCount = document.getElementById('daily-char-count');
  if (input && charCount) {
    charCount.textContent = input.value.length + '/140';
    input.addEventListener('input', function() {
      charCount.textContent = input.value.length + '/140';
    });
  }

  // 心情切换
  area.querySelectorAll('.daily-mood-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      area.querySelectorAll('.daily-mood-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _dailyMood = btn.dataset.mood;
    });
  });

  // 保存
  document.getElementById('daily-save-btn').addEventListener('click', function() {
    var text = input.value.trim();
    if (!text) {
      showToast('写点什么吧', 'warning');
      return;
    }
    var daily = loadDaily();
    if (todayEntry) {
      todayEntry.text = text;
      todayEntry.mood = _dailyMood;
    } else {
      daily.push({
        id: uuid(),
        date: today,
        text: text,
        mood: _dailyMood,
      });
    }
    saveDaily(daily);
    renderDaily();
    showToast(todayEntry ? '已更新' : '已记下', 'success');
  });
}

function renderDailyList() {
  var list = document.getElementById('daily-list');
  var daily = loadDaily().sort(function(a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  if (daily.length === 0) {
    list.innerHTML = '<div class="empty-state">' +
      '<div class="empty-state__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>' +
      '<p class="empty-state__text">一年后，这些句子就是你最珍贵的时间线</p>' +
    '</div>';
    return;
  }

  var html = daily.map(function(d) {
    var dateDisplay = d.date;
    // 简化日期显示
    var parts = d.date.split('-');
    if (parts.length === 3) {
      dateDisplay = parts[1] + '/' + parts[2];
    }
    return '<div class="daily-item">' +
      '<div class="daily-item__date">' +
        '<span class="mood-dot mood-dot--' + (d.mood || 'ordinary') + '"></span>' +
        escapeHtml(dateDisplay) +
      '</div>' +
      '<div class="daily-item__text">' + escapeHtml(d.text) + '</div>' +
      '<button class="daily-item__del" data-daily-id="' + d.id + '" type="button">删除</button>' +
    '</div>';
  }).join('');

  list.innerHTML = html;

  // 删除
  list.querySelectorAll('.daily-item__del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.dataset.dailyId;
      confirmDelete('删除记录', '确定删除这句话？', function() {
        var d = loadDaily();
        var deleted = d.find(function(x) { return x.id === id; });
        saveDaily(d.filter(function(x) { return x.id !== id; }));
        renderDaily();
        showToast('已删除', 'success', {
          undo: function() {
            if (deleted) {
              var d2 = loadDaily();
              d2.push(deleted);
              saveDaily(d2);
              renderDaily();
            }
          }
        });
      });
    });
  });
}

// ============================================================
// 首次使用引导
// ============================================================

function loadProfile() { return loadJSON(STORAGE_PROFILE, {}); }
function saveProfile(p) { saveJSON(STORAGE_PROFILE, p); }

function getUserName() {
  var p = loadProfile();
  return p.name || '';
}

function updateTopbarName() {
  var name = getUserName();
  var mottoEl = document.querySelector('.topbar__motto');
  if (mottoEl) {
    mottoEl.textContent = name ? name + '，记录即存在' : '记录即存在';
  }
}

// 撒花动画
function triggerConfetti(container) {
  if (!container) container = document.getElementById('onboard-confetti');
  if (!container) return;
  container.innerHTML = '';
  var colors = ['#fbbf24', '#38bdf8', '#a78bfa', '#f87171', '#34d399', '#fff'];
  for (var i = 0; i < 40; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    piece.style.width = (6 + Math.random() * 6) + 'px';
    piece.style.height = piece.style.width;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    container.appendChild(piece);
  }
  setTimeout(function() { container.innerHTML = ''; }, 3000);
}

// 切换 onboarding 屏
function onboardingGoScreen(n) {
  document.querySelectorAll('.onboarding__screen').forEach(function(s) {
    s.classList.remove('onboarding__screen--active');
  });
  var target = document.querySelector('.onboarding__screen[data-screen="' + n + '"]');
  if (target) target.classList.add('onboarding__screen--active');
}

function startOnboarding() {
  var ob = document.getElementById('onboarding');
  if (!ob) return;
  ob.hidden = false;

  // 第一屏 → 第二屏
  var cta1 = ob.querySelector('[data-next-screen="2"]');
  if (cta1) {
    cta1.addEventListener('click', function() { onboardingGoScreen(2); });
  }

  // 第二屏：记下来
  var recordBtn = document.getElementById('onboard-record-btn');
  if (recordBtn) {
    recordBtn.addEventListener('click', function() {
      var name = document.getElementById('onboard-goal-name').value.trim();
      var why  = document.getElementById('onboard-goal-why').value.trim();
      if (!name) {
        var input = document.getElementById('onboard-goal-name');
        input.style.borderColor = 'var(--c-danger)';
        input.placeholder = '写一个吧，哪怕只是一个词';        input.focus();
        setTimeout(function() { input.style.borderColor = ''; }, 1500);
        return;
      }

      // 创建第一个目标
      var goal = {
        id: uuid(),
        name: name,
        why: why || '',
        type: 'cumulative',
        target: 100,
        startVal: 0,
        currentValue: 0,
        unit: '%',
        checkins: [],
        completed: false,
        createdDate: todayKey(),
        onboardCreated: true,
      };
      var goals = loadGoals();
      goals.push(goal);
      saveGoals(goals);

      // 撒花
      triggerConfetti();

      // 隐藏问题区，显示环形进度条
      var ringSection = document.getElementById('onboard-ring-section');
      var question = ob.querySelector('.onboarding__question');
      var goalInput = document.getElementById('onboard-goal-name');
      var whyInput = document.getElementById('onboard-goal-why');
      var recordBtn2 = document.getElementById('onboard-record-btn');
      if (question) question.style.display = 'none';
      if (goalInput) goalInput.style.display = 'none';
      if (whyInput) whyInput.style.display = 'none';
      if (recordBtn2) recordBtn2.style.display = 'none';
      if (ringSection) ringSection.hidden = false;
    });
  }

  // 第二屏：敢 → 名字输入
  var dareBtn = document.getElementById('onboard-dare-btn');
  if (dareBtn) {
    dareBtn.addEventListener('click', function() {
      var ringSection = document.getElementById('onboard-ring-section');
      var nameSection = document.getElementById('onboard-name-section');
      if (ringSection) ringSection.style.display = 'none';
      if (nameSection) nameSection.hidden = false;
    });
  }

  // 第二屏 → 第三屏
  var nextBtn3 = ob.querySelector('[data-next-screen="3"]');
  if (nextBtn3) {
    nextBtn3.addEventListener('click', function() {
      var nameInput = document.getElementById('onboard-name');
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        if (nameInput) {
          nameInput.style.borderColor = 'var(--c-danger)';
          nameInput.placeholder = '叫您什么好？';
          nameInput.focus();
          setTimeout(function() { nameInput.style.borderColor = ''; }, 1500);
        }
        return;
      }
      // 保存名字
      var profile = loadProfile();
      profile.name = name;
      saveProfile(profile);
      updateTopbarName();

      onboardingGoScreen(3);
      startCardCarousel();
    });
  }

  // 第三屏：进入我的人生
  var enterBtn = document.getElementById('onboard-enter-btn');
  if (enterBtn) {
    enterBtn.addEventListener('click', finishOnboarding);
  }

  // 跳过
  var skipBtn = document.getElementById('onboard-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', function() {
      // 跳过也保存名字（如果填了）
      var nameInput = document.getElementById('onboard-name');
      if (nameInput && nameInput.value.trim()) {
        var profile = loadProfile();
        profile.name = nameInput.value.trim();
        saveProfile(profile);
        updateTopbarName();
      }
      finishOnboarding();
    });
  }
}

// 第三屏卡片手动切换
var _onboardCardIdx = 0;
var _onboardCardViewed = [false, false, false];
function startCardCarousel() {
  var cards = document.querySelectorAll('.onboarding__card');
  var dots = document.querySelectorAll('.onboarding__dot');
  var prevBtn = document.getElementById('onboard-card-prev');
  var nextBtn = document.getElementById('onboard-card-next');
  var finalEl = document.getElementById('onboard-final');
  var cardsContainer = document.getElementById('onboard-cards');
  var navEl = document.getElementById('onboard-card-nav');
  var skipBtn = document.getElementById('onboard-skip-btn');

  _onboardCardIdx = 0;
  _onboardCardViewed = [false, false, false];
  _onboardCardViewed[0] = true;

  function updateCardUI() {
    cards.forEach(function(c, i) {
      c.classList.toggle('onboarding__card--active', i === _onboardCardIdx);
    });
    dots.forEach(function(d, i) {
      d.classList.toggle('onboarding__dot--active', i === _onboardCardIdx);
      d.classList.toggle('onboarding__dot--viewed', _onboardCardViewed[i] && i !== _onboardCardIdx);
    });
    if (prevBtn) prevBtn.disabled = _onboardCardIdx === 0;
    if (nextBtn) nextBtn.disabled = false;
  }

  function showFinal() {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (navEl) navEl.style.display = 'none';
    if (skipBtn) skipBtn.style.display = 'none';
    if (finalEl) {
      finalEl.hidden = false;
      var name = getUserName();
      var finalText = document.getElementById('onboard-final-text');
      if (finalText) {
        finalText.textContent = '记录即存在。' + (name || '朋友') + '，从今天的0%开始。';
      }
    }
  }

  function goNext() {
    if (_onboardCardIdx < cards.length - 1) {
      _onboardCardIdx++;
      _onboardCardViewed[_onboardCardIdx] = true;
      updateCardUI();
    } else {
      // 最后一张，查看完毕
      showFinal();
    }
  }

  function goPrev() {
    if (_onboardCardIdx > 0) {
      _onboardCardIdx--;
      updateCardUI();
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', goPrev);
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', goNext);
  }

  // 点击圆点跳转
  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      var idx = parseInt(dot.dataset.dot);
      _onboardCardIdx = idx;
      _onboardCardViewed[idx] = true;
      updateCardUI();
    });
  });

  updateCardUI();
}

function finishOnboarding() {
  localStorage.setItem(STORAGE_ONBOARDED, 'true');

  var name = getUserName() || '朋友';
  var ob = document.getElementById('onboarding');

  // 创建仪式感过渡层
  var ritual = document.createElement('div');
  ritual.className = 'onboarding__ritual';
  ritual.innerHTML = '<p class="onboarding__ritual-text">记录即存在。' + escapeHtml(name) + '，第一天，开始了。</p>';
  document.body.appendChild(ritual);

  // 强制重绘后开始渐暗
  void ritual.offsetWidth;

  // 第1阶段：渐暗1秒
  ritual.classList.add('onboarding__ritual--visible');

  // 第2阶段：黑屏文字浮现（渐暗完成后）
  setTimeout(function() {
    var ritualText = ritual.querySelector('.onboarding__ritual-text');
    if (ritualText) ritualText.classList.add('onboarding__ritual-text--visible');
  }, 1000);

  // 第3阶段：文字停留1.5秒后淡出
  setTimeout(function() {
    ritual.classList.add('onboarding__ritual--fadeout');
    // 隐藏引导层
    if (ob) {
      ob.hidden = true;
      ob.innerHTML = '';
    }
    // 刷新首页数据
    updateTopbarName();
    renderTodayPanel();
    renderGoals();
    checkReminders();
    localStorage.setItem('lifeos_onboard_goal_date', todayKey());
  }, 1000 + 800 + 1500); // 渐暗1秒 + 文字淡入0.8秒 + 停留1.5秒

  // 第4阶段：淡出完成后移除仪式层 + 撒花
  setTimeout(function() {
    ritual.remove();
    // 撒花
    launchConfetti();
  }, 1000 + 800 + 1500 + 1000); // 再等淡出1秒
}

// 留存钩子：第二次打开，若昨日创建了目标但未打卡
function checkRetentionHook() {
  var onboardDate = localStorage.getItem('lifeos_onboard_goal_date');
  if (!onboardDate) return;

  var today = todayKey();
  var yesterday = formatDate(new Date(Date.now() - 86400000).toISOString());

  // 只在引导后的第二天触发
  if (onboardDate !== yesterday) return;

  // 检查引导创建的目标是否有打卡记录
  var goals = loadGoals();
  var onboardGoal = goals.find(function(g) { return g.onboardCreated; });
  if (!onboardGoal) return;

  var hasCheckin = (onboardGoal.checkins || []).some(function(c) {
    return c.date >= onboardDate;
  });

  if (!hasCheckin) {
    // 显示留存钩子
    var panel = document.getElementById('today-panel');
    if (!panel) return;

    var hook = document.createElement('div');
    hook.className = 'retention-hook';
    hook.innerHTML =
      '<span class="retention-hook__text">昨天你说<strong>敢</strong>。今天，第一步？</span>' +
      '<button class="btn btn--primary retention-hook__btn" type="button">去打卡</button>';
    panel.insertBefore(hook, panel.firstChild);

    hook.querySelector('.retention-hook__btn').addEventListener('click', function() {
      switchView('goals');
      setTimeout(function() { openGoalDetail(onboardGoal.id); }, 200);
    });
  }
}

// 重看引导
function replayOnboarding() {
  localStorage.removeItem(STORAGE_ONBOARDED);
  location.reload();
}

// ============================================================
// 融合版仪表盘
// Sprint 1：骨架 + 黑金皮肤
// Sprint 2：今日板块（日程 + 打卡 + 目标挂钩 + 趋势/目标概览）
// ============================================================

// ---- 数据层 ----
var STORAGE_SCHEDULE = 'lifeos_schedule';
var STORAGE_CHECKINS = 'lifeos_checkins';

function loadSchedule() { return loadJSON(STORAGE_SCHEDULE, []); }
function saveSchedule(s) { saveJSON(STORAGE_SCHEDULE, s); }
function loadCheckins() { return loadJSON(STORAGE_CHECKINS, {}); }
function saveCheckins(c) { saveJSON(STORAGE_CHECKINS, c); }

// 某日程在某天是否出现
function scheduleAppearsOn(item, dateKey) {
  if (!item) return false;
  if (item.repeat === 'daily') return true;
  if (item.repeat === 'weekly') {
    var jsDay = new Date(dateKey + 'T00:00:00').getDay(); // 0=周日
    var ourDay = jsDay === 0 ? 7 : jsDay;                 // 1=一 … 7=日
    return (item.days || []).indexOf(ourDay) !== -1;
  }
  if (item.repeat === 'once') return item.date === dateKey;
  return false;
}

// 某天要出现的事项（按时间排序，无时间排最后）
function getScheduleFor(dateKey) {
  return loadSchedule()
    .filter(function(it) { return scheduleAppearsOn(it, dateKey); })
    .sort(function(a, b) {
      var ta = a.time || '99:99';
      var tb = b.time || '99:99';
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });
}

function getDayCheckins(dateKey) {
  var all = loadCheckins();
  return all[dateKey] || {};
}

// ---- 打卡人味文案（按内容具体夸，不审判）----
var CHECKIN_PRAISES = [
  '做完了。今天的力气，没白花',
  '又完成一件。这些小事，正在把你送到想去的地方',
  '打钩了，剩下的时间理直气壮地休息',
  '很好，这件事它等到了你'
];

// ---- 打卡 ----
function checkScheduleItem(itemId) {
  var item = loadSchedule().find(function(s) { return s.id === itemId; });
  var all = loadCheckins();
  var today = todayKey();
  if (!all[today]) all[today] = {};
  if (all[today][itemId]) return; // 已打过，不重复记

  var now = new Date();
  var entry = {
    time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    goal: item ? (item.goalId || null) : null,
    goalCounted: false, // 这一次打卡有没有给目标计数（防重复：一天只计一次）
    goalTime: null      // 若计数了，对应目标 checkin 的 time（撤销时精确移除）
  };

  // 目标挂钩：复用目标打卡（streak / 成就 / 完成仪式全套联动）
  // 防重复计数：同一目标当天已有打卡（手动或其他日程）就不再 +1
  var justCompletedGoal = false;
  var alreadyCountedToday = false;
  if (item && item.goalId) {
    var g = loadGoals().find(function(x) { return x.id === item.goalId; });
    if (g && !g.completed && !g.paused) {
      alreadyCountedToday = (g.checkins || []).some(function(c) { return c.date === today; });
      if (!alreadyCountedToday) {
        quickCheckin(item.goalId, 1, null);
        var gAfter = loadGoals().find(function(x) { return x.id === item.goalId; });
        justCompletedGoal = gAfter && gAfter.completed;
        if (!justCompletedGoal) {
          entry.goalCounted = true;
          entry.goalTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        }
      }
    }
  }

  all[today][itemId] = entry;
  saveCheckins(all);

  renderTodayBoard();

  if (!justCompletedGoal) {
    if (alreadyCountedToday) {
      showToast('这件事算你完成了。今天这个目标已经记过，就不重复计数了', 'info');
    } else {
      var praise = CHECKIN_PRAISES[Math.floor(Math.random() * CHECKIN_PRAISES.length)];
      var g2 = item && item.goalId ? loadGoals().find(function(x) { return x.id === item.goalId; }) : null;
      if (g2) praise += '，' + g2.name + ' 也跟着前进了';
      showToast(praise, 'success');
    }
  }
}

// ---- 撤销打卡 ----
function undoScheduleCheckin(itemId) {
  var all = loadCheckins();
  var today = todayKey();
  if (!all[today] || !all[today][itemId]) return;
  var entry = all[today][itemId];
  delete all[today][itemId];
  saveCheckins(all);

  // 如果这次打卡给目标记过数，把对应的目标 checkin 也撤掉
  if (entry.goalCounted && entry.goal && entry.goalTime) {
    var goals = loadGoals();
    var g = goals.find(function(x) { return x.id === entry.goal; });
    if (g && g.checkins) {
      var before = g.checkins.length;
      g.checkins = g.checkins.filter(function(c) {
        return !(c.date === today && c.time === entry.goalTime);
      });
      if (g.checkins.length < before) {
        g.currentValue = Math.max(0, (g.currentValue || 0) - 1);
        // 若目标是被这一下打完成的，跟着退回未完成
        if (g.completed && g.target > 0 && g.currentValue < g.target) {
          g.completed = false;
          delete g.completedDate;
        }
        saveGoals(goals);
      }
    }
  }

  renderTodayBoard();
  showToast('撤回了，它回列表里等你，目标那边也还原了', 'info');
}

// ---- 渲染：第一屏 今日列表 ----
function renderTodayBoard() {
  var slideList = document.getElementById('today-slide-list');
  if (!slideList) return;
  var today = todayKey();
  var items = getScheduleFor(today);
  var checked = getDayCheckins(today);
  var doneCount = items.filter(function(it) { return checked[it.id]; }).length;
  var goals = {};
  loadGoals().forEach(function(g) { goals[g.id] = g; });

  var html = '';

  // 汇总行
  if (items.length > 0) {
    var sumText = doneCount === items.length
      ? '今天的事都清完了，一共 ' + items.length + ' 件'
      : '已完成 ' + doneCount + ' / ' + items.length + '，不急，一件一件来';
    html += '<div class="today-summary">' + sumText + '</div>';
  }

  if (items.length === 0) {
    html += '<div class="today-empty">' +
      '<p class="today-empty__text">今天还没有安排。<br>哪怕只是「好好吃顿饭」，也值得占一格。</p>' +
      '<button class="btn btn--primary btn--small" data-schedule-add type="button">＋ 安排一件事</button>' +
      '</div>';
  } else {
    var pendingShown = 0;
    items.forEach(function(it) {
      if (checked[it.id]) return; // 打卡了就隐藏
      pendingShown++;
      var g = it.goalId ? goals[it.goalId] : null;
      html += '<div class="today-item" data-item-id="' + it.id + '">' +
        '<span class="today-item__time">' + (it.time || '随时') + '</span>' +
        '<span class="today-item__body">' +
          '<span class="today-item__title">' + escapeHtml(it.title) + '</span>' +
          (g ? '<span class="today-item__goal">↗ ' + escapeHtml(g.name) + '</span>' : '') +
        '</span>' +
        '<button class="today-item__check" data-check="' + it.id + '" type="button" aria-label="打卡 ' + escapeHtml(it.title) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
      '</div>';
    });
    if (pendingShown === 0) {
      html += '<div class="today-empty">' +
        '<p class="today-empty__text">都做完了。剩下的时间，是你的。</p>' +
        '</div>';
    }
  }

  // 今日已完成区（明确可见 + 可撤销，不做隐藏状态）
  var doneItems = items.filter(function(it) { return checked[it.id]; });
  if (doneItems.length > 0) {
    html += '<div class="today-done-block">' +
      '<div class="today-done-block__title">今日已完成 · ' + doneItems.length + ' 件（点撤销可退回）</div>';
    doneItems.forEach(function(it) {
      html += '<div class="today-item today-item--checked" data-item-id="' + it.id + '">' +
        '<span class="today-item__time">' + (checked[it.id].time || '') + '</span>' +
        '<span class="today-item__body">' +
          '<span class="today-item__title">' + escapeHtml(it.title) + '</span>' +
        '</span>' +
        '<button class="today-item__undo" data-undo="' + it.id + '" type="button" aria-label="撤销 ' + escapeHtml(it.title) + '">撤销</button>' +
      '</div>';
    });
    html += '</div>';
  }

  // 底部操作行
  html += '<div class="today-actions">' +
    '<button class="btn btn--ghost btn--small" data-schedule-add type="button">＋ 添加日程</button>' +
    '<button class="btn btn--ghost btn--small" data-schedule-manage type="button">管理</button>' +
  '</div>';

  slideList.innerHTML = html;

  renderTodayTrend();
  renderTodayGoals();
}

// ---- 渲染：第二屏 7 天趋势（原生 SVG）----
function renderTodayTrend() {
  var slide = document.getElementById('today-slide-trend');
  if (!slide) return;
  var schedule = loadSchedule();
  if (schedule.length === 0) {
    slide.innerHTML = '<p class="quad-slide__hint">攒了几天打卡之后，这里会替你看见<strong>最近一周的你</strong>。</p>';
    return;
  }

  var days = [];
  var cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (var i = 6; i >= 0; i--) {
    var d = new Date(cursor);
    d.setDate(d.getDate() - i);
    days.push(formatDate(d.toISOString()));
  }

  var maxTotal = 0;
  var data = days.map(function(dk) {
    var items = getScheduleFor(dk);
    var done = getDayCheckins(dk);
    var total = items.length;
    var doneN = items.filter(function(it) { return done[it.id]; }).length;
    if (total > maxTotal) maxTotal = total;
    return { date: dk, total: total, done: doneN };
  });

  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var W = 300, H = 110, padX = 8, padY = 24, gap = 6;
  var barW = (W - padX * 2 - gap * 6) / 7;
  var svg = '<svg class="trend-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近7天完成趋势">';
  data.forEach(function(d, i) {
    var x = padX + i * (barW + gap);
    var jsDay = new Date(d.date + 'T00:00:00').getDay();
    var label = weekdays[jsDay];
    var fullH = maxTotal > 0 ? 64 : 0;
    var y0 = padY + fullH;
    if (d.total === 0) {
      svg += '<line x1="' + (x + barW / 2) + '" y1="' + (y0 - 8) + '" x2="' + (x + barW / 2) + '" y2="' + y0 + '" stroke="var(--border-strong)" stroke-width="2" stroke-linecap="round"/>';
    } else {
      var hDone = fullH * (d.done / d.total);
      var hTodo = fullH - hDone;
      if (hTodo > 0.5) {
        svg += '<rect x="' + x + '" y="' + (y0 - fullH) + '" width="' + barW + '" height="' + hTodo + '" rx="3" fill="var(--bg-card-2)" stroke="var(--border)"/>';
      }
      if (hDone > 0.5) {
        svg += '<rect x="' + x + '" y="' + (y0 - hDone) + '" width="' + barW + '" height="' + hDone + '" rx="3" fill="var(--c-accent)"/>';
      }
      if (d.done > 0) {
        svg += '<text x="' + (x + barW / 2) + '" y="' + (y0 - hDone - 5) + '" text-anchor="middle" font-size="10" fill="var(--t-2)">' + d.done + '</text>';
      }
    }
    svg += '<text x="' + (x + barW / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--t-3)">' + (i === 6 ? '今天' : label) + '</text>';
  });
  svg += '</svg>';

  var totalDone7 = data.reduce(function(s, d) { return s + d.done; }, 0);
  var trendText = totalDone7 === 0
    ? '最近一周还没有打卡记录，第一下最贵，点下去就便宜了'
    : '这七天你完成了 ' + totalDone7 + ' 件事，一格一格都是自己长出来的';

  slide.innerHTML = svg + '<p class="today-trend__text">' + trendText + '</p>';
}

// ---- 渲染：第三屏 目标概览 ----
function renderTodayGoals() {
  var slide = document.getElementById('today-slide-goals');
  if (!slide) return;
  var goals = loadGoals().filter(function(g) { return !g.completed; });
  if (goals.length === 0) {
    slide.innerHTML = '<p class="quad-slide__hint">还没有在走的目标。<br>去「我的 · 个人目标」立一个，日程就能和它挂钩。</p>';
    return;
  }
  var html = '<p class="today-goals__count">在路上：' + goals.length + ' 个</p>';
  goals.slice(0, 5).forEach(function(g) {
    var p = Math.round(calcProgress(g) * 100);
    var checkedToday = (g.checkins || []).some(function(c) { return c.date === todayKey(); });
    html += '<button class="today-goal" data-goal-go="' + g.id + '" type="button">' +
      '<span class="today-goal__name">' + escapeHtml(g.name) + (checkedToday ? '<span class="today-goal__today">今日已打卡</span>' : '') + '</span>' +
      '<span class="today-goal__bar"><span class="today-goal__fill" style="width:' + p + '%"></span></span>' +
      '<span class="today-goal__pct">' + p + '%</span>' +
    '</button>';
  });
  if (goals.length > 5) {
    html += '<p class="today-goals__more">还有 ' + (goals.length - 5) + ' 个目标在「我的」里等你</p>';
  }
  slide.innerHTML = html;
}

// ---- 日程表单（新建 / 编辑）----
var _weekdayPicked = [];

function repeatDesc(item) {
  if (!item) return '';
  if (item.repeat === 'daily') return '每天';
  if (item.repeat === 'weekly') {
    var names = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };
    var ds = (item.days || []).slice().sort(function(a, b) { return a - b; })
      .map(function(d) { return names[d] || d; }).join(' ');
    return '每周 ' + (ds || '（未选周几）');
  }
  if (item.repeat === 'once') return (item.date || '') + ' 一次';
  return '';
}

function populateScheduleGoalSelect(selectedId) {
  var sel = document.getElementById('schedule-goal');
  if (!sel) return;
  var keep = sel.querySelector('option'); // 第一个"不挂钩"选项
  sel.innerHTML = '';
  sel.appendChild(keep);
  loadGoals().filter(function(g) { return !g.completed; }).forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name + '（' + Math.round(calcProgress(g) * 100) + '%）';
    if (selectedId === g.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openScheduleModal(editId) {
  var modal = document.getElementById('schedule-modal');
  if (!modal) return;
  var isEdit = !!editId;
  var item = null;
  if (isEdit) {
    item = loadSchedule().find(function(s) { return s.id === editId; });
    if (!item) return;
  }

  document.getElementById('schedule-modal-title').textContent = isEdit ? '改一改这件事' : '添加日程';
  document.getElementById('schedule-modal-hint').textContent = isEdit
    ? '改好之后，它明天还是老位置等你'
    : '把要做的事先请进来，打卡只要点一下';
  document.getElementById('schedule-edit-id').value = isEdit ? item.id : '';
  document.getElementById('schedule-title').value = isEdit ? (item.title || '') : '';
  document.getElementById('schedule-time').value = isEdit ? (item.time || '') : '';
  document.getElementById('schedule-end').value = isEdit ? (item.endTime || '') : '';
  document.getElementById('schedule-repeat').value = isEdit ? (item.repeat || 'daily') : 'daily';
  document.getElementById('schedule-date').value = isEdit ? (item.date || '') : '';

  _weekdayPicked = isEdit ? (item.days || []).slice() : [];
  updateWeekdayChips();
  updateScheduleRepeatFields();
  populateScheduleGoalSelect(isEdit ? (item.goalId || '') : '');

  var errEl = document.querySelector('#schedule-form .field__error');
  if (errEl) errEl.textContent = '';
  var titleEl = document.getElementById('schedule-title');
  titleEl.classList.remove('field__input--error');
  var quickGoalArea = document.getElementById('schedule-quick-goal');
  if (quickGoalArea) quickGoalArea.hidden = true;

  openModal(modal);
  setTimeout(function() { titleEl.focus(); }, 60);
}

function updateWeekdayChips() {
  document.querySelectorAll('#schedule-weekdays .weekday-chip').forEach(function(chip) {
    var day = parseInt(chip.dataset.day, 10);
    chip.classList.toggle('weekday-chip--active', _weekdayPicked.indexOf(day) !== -1);
  });
}

function updateScheduleRepeatFields() {
  var rep = document.getElementById('schedule-repeat').value;
  document.getElementById('schedule-weekdays').hidden = (rep !== 'weekly');
  document.getElementById('schedule-once-date-wrap').hidden = (rep !== 'once');
}

function closeScheduleModal() {
  var modal = document.getElementById('schedule-modal');
  if (modal) modal.hidden = true;
}

function saveScheduleFromForm() {
  var title = document.getElementById('schedule-title').value.trim();
  var time = document.getElementById('schedule-time').value;
  var endTime = document.getElementById('schedule-end').value;
  var repeat = document.getElementById('schedule-repeat').value;
  var date = document.getElementById('schedule-date').value;
  var goalId = document.getElementById('schedule-goal').value || null;
  var editId = document.getElementById('schedule-edit-id').value;

  // 校验：标题必填
  var errEl = document.querySelector('#schedule-form .field__error');
  var titleEl = document.getElementById('schedule-title');
  if (!title) {
    if (errEl) errEl.textContent = '给它起个名字吧，不然打卡的时候会想不起来是啥';
    titleEl.classList.add('field__input--error');
    titleEl.focus();
    return;
  }
  if (repeat === 'weekly' && _weekdayPicked.length === 0) {
    if (errEl) errEl.textContent = '选一下周几出现，全选就是每天';
    return;
  }
  if (repeat === 'once' && !date) {
    if (errEl) errEl.textContent = '选一下是哪一天';
    return;
  }
  if (errEl) errEl.textContent = '';

  var schedule = loadSchedule();
  if (editId) {
    var it = schedule.find(function(s) { return s.id === editId; });
    if (it) {
      it.title = title;
      it.time = time || '';
      it.endTime = endTime || '';
      it.repeat = repeat;
      it.days = repeat === 'weekly' ? _weekdayPicked.slice() : (it.days || []);
      it.date = repeat === 'once' ? date : '';
      it.goalId = goalId;
    }
  } else {
    schedule.push({
      id: uuid(),
      title: title,
      time: time || '',
      endTime: endTime || '',
      repeat: repeat,
      days: repeat === 'weekly' ? _weekdayPicked.slice() : [],
      date: repeat === 'once' ? date : '',
      goalId: goalId,
      createdAt: new Date().toISOString()
    });
  }
  saveSchedule(schedule);
  closeScheduleModal();
  renderTodayBoard();
  renderScheduleManageList();
  showToast(editId ? '改好了，位置不变' : '放进来了，到时候见', 'success');
}

// ---- 日程管理列表 ----
function renderScheduleManageList() {
  var listEl = document.getElementById('schedule-manage-list');
  if (!listEl) return;
  var schedule = loadSchedule();
  var goals = {};
  loadGoals().forEach(function(g) { goals[g.id] = g; });

  if (schedule.length === 0) {
    listEl.innerHTML = '<p class="schedule-manage__empty">还没有日程。上面点「＋ 新建」，或者从首页「添加日程」开始。</p>';
    return;
  }

  var html = '';
  schedule.forEach(function(it) {
    var g = it.goalId ? goals[it.goalId] : null;
    html += '<div class="schedule-manage__row">' +
      '<div class="schedule-manage__info">' +
        '<span class="schedule-manage__title">' + escapeHtml(it.title) + '</span>' +
        '<span class="schedule-manage__meta">' +
          (it.time ? it.time + (it.endTime ? '–' + it.endTime : '') : '随时') +
          ' · ' + repeatDesc(it) +
          (g ? ' · ↗ ' + escapeHtml(g.name) : '') +
        '</span>' +
      '</div>' +
      '<div class="schedule-manage__btns">' +
        '<button class="btn btn--ghost btn--small" data-sched-edit="' + it.id + '" type="button">编辑</button>' +
        '<button class="btn btn--ghost btn--small schedule-manage__del" data-sched-del="' + it.id + '" type="button">删除</button>' +
      '</div>' +
    '</div>';
  });
  listEl.innerHTML = html;
}

function deleteScheduleItem(id) {
  var it = loadSchedule().find(function(s) { return s.id === id; });
  var name = it ? it.title : '这条日程';
  confirmDelete('删除「' + name + '」？', '只删日程本身，目标不受影响；已经打过卡的历史记录会保留。',
    function() {
      var schedule = loadSchedule().filter(function(s) { return s.id !== id; });
      saveSchedule(schedule);
      renderScheduleManageList();
      renderTodayBoard();
      showToast('删掉了。它是来帮忙的，走了也不欠你什么', 'info');
    });
}

// ---- 仪表盘头部 ----
function renderDashboard() {
  var now = new Date();
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var dateEl = document.getElementById('dash-date');
  if (dateEl) {
    dateEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · 星期' + weekdays[now.getDay()];
  }

  var greetEl = document.getElementById('dash-greet');
  if (greetEl) {
    var h = now.getHours();
    var greet;
    if (h < 5)       greet = '夜深了';
    else if (h < 9)  greet = '早上好';
    else if (h < 12) greet = '上午好';
    else if (h < 14) greet = '中午好';
    else if (h < 18) greet = '下午好';
    else              greet = '晚上好';
    // 认识你，就带你名字打招呼
    var profile = loadProfile();
    if (profile && profile.name) {
      greet += '，' + profile.name;
    }
    greetEl.textContent = greet;
  }

  renderTodayBoard();
}

function initDashboard() {
  renderDashboard();

  // 全局弹窗关闭委托：任何 [data-close-modal] 都能关掉自己所在的弹窗
  // （此前只有目标弹窗的关闭按钮被单独绑定，日程等新弹窗的取消按钮失灵——已证实修复）
  document.addEventListener('click', function(e) {
    var closer = e.target.closest('[data-close-modal]');
    if (!closer) return;
    var modal = closer.closest('.modal');
    if (modal) closeAnyModal(modal);
  });

  // 四宫格：滑动时同步小圆点
  document.querySelectorAll('.quad-swipe').forEach(function(swipe) {
    var panel = swipe.closest('.quad-panel');
    var dots = panel ? panel.querySelectorAll('.quad-dot') : [];
    if (dots.length === 0) return;
    swipe.addEventListener('scroll', function() {
      var idx = Math.round(swipe.scrollLeft / Math.max(swipe.clientWidth, 1));
      dots.forEach(function(d, i) {
        d.classList.toggle('quad-dot--active', i === idx);
      });
    });
  });

  // 今日板块：事件委托（打卡 / 添加 / 管理 / 跳目标）
  var todaySwipe = document.getElementById('today-swipe');
  if (todaySwipe) {
    todaySwipe.addEventListener('click', function(e) {
      var checkBtn = e.target.closest('[data-check]');
      if (checkBtn) {
        var row = checkBtn.closest('.today-item');
        if (row) row.classList.add('today-item--done'); // 先动画
        setTimeout(function() { checkScheduleItem(checkBtn.dataset.check); }, 260);
        return;
      }
      var addBtn = e.target.closest('[data-schedule-add]');
      if (addBtn) { openScheduleModal(null); return; }
      var undoBtn = e.target.closest('[data-undo]');
      if (undoBtn) { undoScheduleCheckin(undoBtn.dataset.undo); return; }
      var manageBtn = e.target.closest('[data-schedule-manage]');
      if (manageBtn) {
        renderScheduleManageList();
        openModal(document.getElementById('schedule-manage-modal'));
        return;
      }
      var goalBtn = e.target.closest('[data-goal-go]');
      if (goalBtn) { switchView('goals'); return; }
    });
  }

  // Sprint 3：自定义面板事件委托
  var customGrid = document.getElementById('custom-cards-grid');
  if (customGrid) {
    customGrid.addEventListener('click', function(e) {
      var incBtn = e.target.closest('[data-cc-inc]');
      if (incBtn) {
        customCardIncrement(incBtn.dataset.ccInc, parseInt(incBtn.dataset.ccDelta, 10));
        return;
      }
      var scoreBtn = e.target.closest('[data-cc-score]');
      if (scoreBtn) {
        customCardScore(scoreBtn.dataset.ccScore, parseInt(scoreBtn.dataset.ccNum, 10));
        return;
      }
      var writeBtn = e.target.closest('[data-cc-write]');
      if (writeBtn) {
        openCustomTextModal(writeBtn.dataset.ccWrite);
        return;
      }
      var delBtn = e.target.closest('[data-cc-del]');
      if (delBtn) {
        deleteCustomCard(delBtn.dataset.ccDel);
        return;
      }
      var newBtn = e.target.closest('[data-cc-new]');
      if (newBtn) {
        openCustomCardModal();
        return;
      }
      var unlockBtn = e.target.closest('[data-cc-unlock]');
      if (unlockBtn) {
        openUnlockModal(unlockBtn.dataset.ccUnlock);
        return;
      }
      var relockBtn = e.target.closest('[data-cc-relock]');
      if (relockBtn) {
        relockCustomCard(relockBtn.dataset.ccRelock);
        return;
      }
      var numBtn = e.target.closest('[data-cc-num]');
      if (numBtn) {
        openNumericInputModal(numBtn.dataset.ccNum);
        return;
      }
      var numHistBtn = e.target.closest('[data-cc-num-history]');
      if (numHistBtn) {
        openNumericHistoryModal(numHistBtn.dataset.ccNumHistory);
        return;
      }
      var cycleBtn = e.target.closest('[data-cc-cycle]');
      if (cycleBtn) {
        openCycleModal(cycleBtn.dataset.ccCycle);
        return;
      }
    });
  }

  // 饮食面板事件委托
  var dietList = document.getElementById('diet-today-list');
  if (dietList) {
    dietList.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-diet]');
      if (delBtn) { deleteDietEntry(delBtn.dataset.delDiet); return; }
    });
  }

  // 卡片管理弹窗事件委托
  var ccManageList = document.getElementById('cc-manage-list');
  if (ccManageList) {
    ccManageList.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-cc-del-mng]');
      if (delBtn) { deleteCustomCard(delBtn.dataset.ccDelMng); return; }
      var upBtn = e.target.closest('[data-cc-up]');
      if (upBtn) { moveCustomCard(upBtn.dataset.ccUp, -1); return; }
      var downBtn = e.target.closest('[data-cc-down]');
      if (downBtn) { moveCustomCard(downBtn.dataset.ccDown, 1); return; }
    });
  }
  var ccManageHeadBtn = document.getElementById('cc-manage-btn');
  if (ccManageHeadBtn) ccManageHeadBtn.addEventListener('click', openCustomManage);

  // 头部「日程管理」按钮
  var manageHeadBtn = document.getElementById('schedule-manage-btn');
  if (manageHeadBtn) {
    manageHeadBtn.addEventListener('click', function() {
      renderScheduleManageList();
      openModal(document.getElementById('schedule-manage-modal'));
    });
  }

  // 日程表单
  var form = document.getElementById('schedule-form');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      saveScheduleFromForm();
    });
    var repSel = document.getElementById('schedule-repeat');
    if (repSel) repSel.addEventListener('change', updateScheduleRepeatFields);
    document.querySelectorAll('#schedule-weekdays .weekday-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var day = parseInt(chip.dataset.day, 10);
        var i = _weekdayPicked.indexOf(day);
        if (i === -1) _weekdayPicked.push(day); else _weekdayPicked.splice(i, 1);
        updateWeekdayChips();
      });
    });

    // 表单内快速新建目标（不退出弹窗）
    var newGoalBtn = document.getElementById('schedule-new-goal-btn');
    var quickGoalArea = document.getElementById('schedule-quick-goal');
    if (newGoalBtn && quickGoalArea) {
      newGoalBtn.addEventListener('click', function() {
        quickGoalArea.hidden = !quickGoalArea.hidden;
        if (!quickGoalArea.hidden) {
          var nameEl = document.getElementById('schedule-new-goal-name');
          nameEl.value = '';
          nameEl.focus();
        }
      });
    }
    var createGoalBtn = document.getElementById('schedule-new-goal-create');
    if (createGoalBtn) {
      createGoalBtn.addEventListener('click', function() {
        var name = (document.getElementById('schedule-new-goal-name').value || '').trim();
        var target = parseFloat(document.getElementById('schedule-new-goal-target').value) || 0;
        var unit = (document.getElementById('schedule-new-goal-unit').value || '').trim() || '次';
        if (!name) {
          showToast('先给它起个名字', 'warning');
          document.getElementById('schedule-new-goal-name').focus();
          return;
        }
        if (target <= 0) {
          showToast('目标值得是正数，慢慢涨的那种', 'warning');
          return;
        }
        var goals = loadGoals();
        var ng = {
          id: uuid(),
          name: name,
          why: '',
          type: 'cumulative',
          target: target,
          startVal: 0,
          currentValue: 0,
          unit: unit,
          checkins: [],
          createdAt: new Date().toISOString()
        };
        goals.push(ng);
        saveGoals(goals);
        populateScheduleGoalSelect(ng.id);
        quickGoalArea.hidden = true;
        showToast('「' + name + '」建好了，已经挂上这件事', 'success');
      });
    }
  }

  // 日程管理弹窗：新建 / 编辑 / 删除（委托）
  var manageModal = document.getElementById('schedule-manage-modal');
  if (manageModal) {
    manageModal.addEventListener('click', function(e) {
      var addBtn = e.target.closest('#schedule-add-another');
      if (addBtn) {
        manageModal.hidden = true;
        openScheduleModal(null);
        return;
      }
      var editBtn = e.target.closest('[data-sched-edit]');
      if (editBtn) {
        manageModal.hidden = true;
        openScheduleModal(editBtn.dataset.schedEdit);
        return;
      }
      var delBtn = e.target.closest('[data-sched-del]');
      if (delBtn) {
        deleteScheduleItem(delBtn.dataset.schedDel);
        return;
      }
    });
  }

  // ＋ 快捷记录抽屉
  var sheet = document.getElementById('quick-add-sheet');
  var plusBtn = document.getElementById('quick-add-btn');
  if (!sheet || !plusBtn) return;

  plusBtn.addEventListener('click', function() {
    sheet.hidden = false;
  });
  sheet.querySelectorAll('[data-close-quick-add]').forEach(function(el) {
    el.addEventListener('click', function() { sheet.hidden = true; });
  });

  var SPRINT_HINT = {
    sleep: 'Sprint 3',
    note: 'Sprint 4',
    money: 'Sprint 4'
  };
  sheet.querySelectorAll('.quick-sheet__item').forEach(function(item) {
    item.addEventListener('click', function() {
      sheet.hidden = true;
      var handled = routeQuickAction(item.dataset.quick);
      if (handled !== false) return;
      var sprint = SPRINT_HINT[item.dataset.quick] || '下个迭代';
      showToast('还没到它出场的时候，' + sprint + ' 见', 'warning');
    });
  });
}

// ============================================================
// Sprint 3：睡眠屏 / 饮食屏 / 自定义卡片 / ＋ 抽屉联通
// ============================================================

// ---- 存储 key（新增，沿用 lifeos_ 前缀） ----
var STORAGE_SLEEP = 'lifeos_sleep';
var STORAGE_DIET = 'lifeos_diet';
var STORAGE_CUSTOM_CARDS = 'lifeos_custom_cards';
var STORAGE_CUSTOM_ENTRIES = 'lifeos_custom_entries';
// 临时编码区，sessionStorage（关页面就锁回去），存已解锁的卡 id 列表
var SESSION_UNLOCKED_CARDS = 'lifeos_unlocked_cards';

// ---- PIN 简单混淆（防朋友窥屏，不是真加密） ----
function simpleHashPin(pin) {
  try { return btoa(String(pin).split('').reverse().join('') + '|lo'); }
  catch(e) { return ''; }
}
function verifyPin(pin, hash) {
  if (!hash) return false;
  return simpleHashPin(pin) === hash;
}

// ---- 解锁态：sessionStorage ----
function getUnlockedCards() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_UNLOCKED_CARDS) || '[]'); }
  catch(e) { return []; }
}
function markCardUnlocked(cardId) {
  var list = getUnlockedCards();
  if (list.indexOf(cardId) === -1) list.push(cardId);
  try { sessionStorage.setItem(SESSION_UNLOCKED_CARDS, JSON.stringify(list)); } catch(e) {}
}
function lockCard(cardId) {
  var list = getUnlockedCards().filter(function(id) { return id !== cardId; });
  try { sessionStorage.setItem(SESSION_UNLOCKED_CARDS, JSON.stringify(list)); } catch(e) {}
}
function isCardUnlocked(cardId) {
  return getUnlockedCards().indexOf(cardId) >= 0;
}

// ---- 数据层 ----
function loadSleep() { return loadJSON(STORAGE_SLEEP, []); }
function saveSleep(arr) { saveJSON(STORAGE_SLEEP, arr); }
function loadDiet() { return loadJSON(STORAGE_DIET, []); }
function saveDiet(arr) { saveJSON(STORAGE_DIET, arr); }
function loadCustomCards() { return loadJSON(STORAGE_CUSTOM_CARDS, []); }
function saveCustomCards(arr) { saveJSON(STORAGE_CUSTOM_CARDS, arr); }
function loadCustomEntries() { return loadJSON(STORAGE_CUSTOM_ENTRIES, []); }
function saveCustomEntries(arr) { saveJSON(STORAGE_CUSTOM_ENTRIES, arr); }

function findSleep(dateKey) {
  return loadSleep().find(function(r) { return r.date === dateKey; });
}
function findDiet(dateKey) {
  return loadDiet().filter(function(r) { return r.date === dateKey; });
}
function customEntriesForCard(cardId, dateKey) {
  return loadCustomEntries().filter(function(e) {
    return e.cardId === cardId && (!dateKey || e.date === dateKey);
  });
}
function customEntriesAll(cardId) {
  return loadCustomEntries().filter(function(e) { return e.cardId === cardId; });
}

// ---- 工具 ----
function parseHM(str) {
  if (!str) return null;
  var p = String(str).split(':');
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
function fmtDuration(min) {
  if (min == null || isNaN(min)) return '—';
  var h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h <= 0) return m + ' 分钟';
  if (m === 0) return h + ' 小时';
  return h + ' 小时 ' + m + ' 分钟';
}
function isLateNight(bedtimeHM) {
  // 23:00 之后入睡算熬夜
  return bedtimeHM != null && bedtimeHM >= 23 * 60;
}
function isShortSleep(totalMin) {
  return totalMin != null && totalMin < 5 * 60;
}

// ---- 渲染：右上第一屏（睡眠） ----
function renderSleepPanel() {
  var today = todayKey();
  var rec = findSleep(today);
  var slide = document.getElementById('sleep-slide-main');
  if (!slide) return;

  // 默认填入当前时间作为建议
  if (!rec) {
    var nowHM = String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0');
    var bedtimeEl = document.getElementById('sleep-bedtime');
    var wakeEl = document.getElementById('sleep-waketime');
    if (bedtimeEl && !bedtimeEl.value) bedtimeEl.value = '23:30';
    if (wakeEl && !wakeEl.value) wakeEl.value = nowHM;
  }

  // 顶部关怀语
  var care = document.getElementById('sleep-care');
  if (care) {
    var careMsg = '';
    if (rec) {
      var totalMin = null;
      var b = parseHM(rec.bedtime), w = parseHM(rec.waketime);
      if (b != null && w != null) {
        // 处理跨天
        totalMin = w >= b ? (w - b) : (24 * 60 - b + w);
      }
      if (totalMin != null && totalMin < 5 * 60) {
        careMsg = '昨晚只睡了 ' + fmtDuration(totalMin) + '——今天别逞强，少安排点高强度的事';
      } else if (totalMin != null && totalMin >= 8 * 60) {
        careMsg = '昨晚睡得不错，今天应该精神很好';
      } else if (totalMin != null) {
        careMsg = '昨晚睡了 ' + fmtDuration(totalMin) + '，今天稳着来';
      } else {
        careMsg = '记一下昨晚的睡眠，它就认识你了';
      }
    } else {
      var h = new Date().getHours();
      if (h < 6) careMsg = '还没睡？或者刚睡下——记一下也来得及';
      else if (h < 11) careMsg = '睡得怎么样？简单记一下';
      else careMsg = '记一下昨晚的睡眠，它就认识你了';
    }
    care.textContent = careMsg;
  }

  // 回填已保存的值
  if (rec) {
    ['bedtime','waketime','deepMin','lightMin','awakeMin','napMinutes'].forEach(function(k) {
      var el = document.getElementById('sleep-' + k);
      if (el && rec[k] != null && rec[k] !== '') el.value = rec[k];
    });
    var noteEl = document.getElementById('sleep-note');
    if (noteEl) noteEl.value = rec.note || '';
  }

  // 占比条（深睡 / 浅睡 / 醒着）
  var bar = document.getElementById('sleep-ratio-bar');
  var ratioText = document.getElementById('sleep-ratio-text');
  if (bar) {
    var deep = parseInt((rec && rec.deepMin) || 0, 10) || 0;
    var light = parseInt((rec && rec.lightMin) || 0, 10) || 0;
    var awake = parseInt((rec && rec.awakeMin) || 0, 10) || 0;
    var total = deep + light + awake;
    if (total > 0) {
      bar.innerHTML = '<div class=\"ratio-seg ratio-seg--deep\" style=\"width:' + (deep * 100 / total) + '%\" title=\"深睡 ' + deep + ' 分\"></div>'
        + '<div class=\"ratio-seg ratio-seg--light\" style=\"width:' + (light * 100 / total) + '%\" title=\"浅睡 ' + light + ' 分\"></div>'
        + '<div class=\"ratio-seg ratio-seg--awake\" style=\"width:' + (awake * 100 / total) + '%\" title=\"醒着 ' + awake + ' 分\"></div>';
      if (ratioText) ratioText.textContent = '深 ' + Math.round(deep * 100 / total) + '% · 浅 ' + Math.round(light * 100 / total) + '% · 醒 ' + Math.round(awake * 100 / total) + '%';
    } else {
      bar.innerHTML = '';
      if (ratioText) ratioText.textContent = '填一下深浅睡占比，曲线更立体';
    }
  }

  // 梦列表（今天）
  var dreamsList = document.getElementById('sleep-dreams-list');
  if (dreamsList) {
    var dreams = customEntriesAll('').filter(function(e) { return false; }); // 占位
    // 梦从 sleep 记录自身的 dreamText 读取 + custom_entries 中 dream 标记的
    var dreamsFromEntries = loadCustomEntries().filter(function(e) {
      return e.date === today && e.kind === 'dream';
    });
    var allDreams = dreamsFromEntries;
    if (rec && rec.dreamText) {
      allDreams = [{ text: rec.dreamText, time: '昨夜', isOld: true }].concat(allDreams);
    }
    if (allDreams.length === 0) {
      dreamsList.innerHTML = '<p class="muted-tiny">还没有梦的记录，点右上「记个梦」</p>';
    } else {
      dreamsList.innerHTML = allDreams.map(function(d) {
        return '<div class="dream-row"><span class="dream-row__time">' + escapeHtml(d.time || '') + '</span><span class="dream-row__text">' + escapeHtml(d.text || '') + '</span></div>';
      }).join('');
    }
  }

  // Sprint 4：近 7 天睡眠趋势曲线
  renderSleepTrend();
}

function saveSleepFromForm(e) {
  if (e) e.preventDefault();
  var rec = {
    date: todayKey(),
    bedtime: (document.getElementById('sleep-bedtime') || {}).value || '',
    waketime: (document.getElementById('sleep-waketime') || {}).value || '',
    deepMin: (document.getElementById('sleep-deepMin') || {}).value || '',
    lightMin: (document.getElementById('sleep-lightMin') || {}).value || '',
    awakeMin: (document.getElementById('sleep-awakeMin') || {}).value || '',
    napMinutes: (document.getElementById('sleep-napMinutes') || {}).value || '',
    note: (document.getElementById('sleep-note') || {}).value || ''
  };
  var arr = loadSleep();
  var idx = arr.findIndex(function(r) { return r.date === rec.date; });
  if (idx >= 0) arr[idx] = rec; else arr.push(rec);
  saveSleep(arr);
  renderSleepPanel();

  // 联动文案（熬夜/时长异常 → 给次日的打卡挂上关怀）
  var bHM = parseHM(rec.bedtime);
  var totalMin = null;
  if (bHM != null && rec.waketime) {
    var wHM = parseHM(rec.waketime);
    if (wHM != null) totalMin = wHM >= bHM ? (wHM - bHM) : (24 * 60 - bHM + wHM);
  }
  if (isLateNight(bHM) || isShortSleep(totalMin)) {
    showToast('睡得有点赶，今天打卡的时候我会念叨一句', 'info');
  } else {
    showToast('睡得记下了', 'success');
  }
}

// ---- 渲染：右上第二屏（饮食） ----
function renderDietPanel() {
  var today = todayKey();
  var slide = document.getElementById('diet-slide-main');
  if (!slide) return;

  // 今日三餐
  var list = document.getElementById('diet-today-list');
  if (list) {
    var meals = findDiet(today);
    if (meals.length === 0) {
      list.innerHTML = '<p class=\"muted-tiny\">还没记，三餐的时间到了随手一下</p>';
    } else {
      list.innerHTML = meals.map(function(m) {
        return '<div class=\"diet-row\"><span class=\"diet-row__time\">' + escapeHtml(m.time || '') + '</span><span class=\"diet-row__meal\">' + escapeHtml(m.meal || '') + '</span><span class=\"diet-row__content\">' + escapeHtml(m.content || '') + '</span><button type=\"button\" class=\"icon-btn\" data-del-diet=\"' + m.id + '\" aria-label=\"删\">×</button></div>';
      }).join('');
    }
  }

  // 健身/体重类目标联动显示
  var link = document.getElementById('diet-goal-link');
  if (link) {
    var goals = loadGoals().filter(function(g) {
      if (g.completed || g.paused) return false;
      return g.type === 'counter';
    });
    if (goals.length === 0) {
      link.innerHTML = '<p class=\"muted-tiny\">在「我的 · 目标」里开个「体重 75kg」这类卡片，这里会同步它的进度</p>';
    } else {
      link.innerHTML = '<div class=\"diet-goal-link__label\">在走的相关目标</div>'
        + goals.map(function(g) {
          var pct = g.target ? Math.min(100, Math.round(((g.currentValue || 0) * 100) / g.target)) : 0;
          return '<div class=\"diet-goal-row\"><span class=\"diet-goal-row__name\">' + escapeHtml(g.name) + '</span><span class=\"diet-goal-row__bar\"><span class=\"diet-goal-row__fill\" style=\"width:' + pct + '%\"></span></span><span class=\"diet-goal-row__pct\">' + pct + '%</span></div>';
        }).join('');
    }
  }
}

function addDietEntry(meal) {
  var contentEl = document.getElementById('diet-input-' + meal);
  if (!contentEl) return;
  var content = (contentEl.value || '').trim();
  if (!content) {
    contentEl.classList.add('field__input--error');
    setTimeout(function() { contentEl.classList.remove('field__input--error'); }, 1200);
    return;
  }
  var now = new Date();
  var time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  var arr = loadDiet();
  arr.push({
    id: uuid(),
    date: todayKey(),
    meal: meal,
    time: time,
    content: content
  });
  saveDiet(arr);
  contentEl.value = '';
  renderDietPanel();
  showToast(mealLabel(meal) + '记下了', 'success');
}

function deleteDietEntry(id) {
  var arr = loadDiet().filter(function(r) { return r.id !== id; });
  saveDiet(arr);
  renderDietPanel();
}

function mealLabel(meal) {
  return { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }[meal] || meal;
}

// ---- 渲染：左下（自定义卡片网格） ----
function renderCustomPanel() {
  var panel = document.getElementById('custom-cards-grid');
  if (!panel) return;
  var cards = loadCustomCards();
  if (cards.length === 0) {
    panel.innerHTML = '<div class=\"custom-empty\">'
      + '<p class=\"custom-empty__text\">还没卡片。开一张——名字你起，记录你自己看。</p>'
      + '<button type=\"button\" class=\"btn btn--primary btn--small\" data-cc-new>＋ 开第一张卡</button>'
      + '</div>';
    return;
  }
  var today = todayKey();
  panel.innerHTML = cards.map(function(c) {
    // 锁着的卡 + 未解锁 → 显示蒙层（不渲染任何数据）
    if (c.locked && !isCardUnlocked(c.id)) {
      return '<div class="cc-card cc-card--locked" data-card-id="' + c.id + '">'
        + '<div class="cc-card__lock-cover">'
        + '<div class="cc-card__lock-icon" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>'
        + '</div>'
        + '<div class="cc-card__lock-name">「' + escapeHtml(c.name) + '」</div>'
        + '<button type="button" class="btn btn--primary btn--small" data-cc-unlock="' + c.id + '">点此解锁</button>'
        + '</div>'
        + '</div>';
    }
    var entries = customEntriesForCard(c.id, today);
    var last7 = customEntriesAll(c.id).filter(function(e) {
      var d = new Date(e.date);
      var diff = (Date.now() - d.getTime()) / 86400000;
      return diff <= 7;
    });
    var body = '';
    if (c.type === 'counter') {
      var total = entries.reduce(function(s, e) { return s + (parseInt(e.valueNum, 10) || 0); }, 0);
      body = '<div class=\"cc-counter__today\">今日：<strong>' + total + '</strong></div>'
        + '<div class=\"cc-counter__week\">近7天：' + last7.reduce(function(s, e) { return s + (parseInt(e.valueNum, 10) || 0); }, 0) + '</div>'
        + '<div class=\"cc-counter__actions\">'
        + '<button type=\"button\" class=\"cc-plus\" data-cc-inc=\"' + c.id + '\" data-cc-delta=\"1\" aria-label=\"+1\">+1</button>'
        + '<button type=\"button\" class=\"cc-plus cc-plus--alt\" data-cc-inc=\"' + c.id + '\" data-cc-delta=\"-1\" aria-label=\"-1\">-1</button>'
        + '</div>';
    } else if (c.type === 'score') {
      var last = entries[entries.length - 1];
      var todayScore = last ? (last.valueNum != null ? last.valueNum : '—') : '—';
      body = '<div class=\"cc-score__today\">今日：<strong>' + todayScore + '</strong></div>'
        + '<div class=\"cc-counter__actions cc-score__scale\">'
        + [1,2,3,4,5,6,7,8,9,10].map(function(n) {
            return '<button type=\"button\" class=\"cc-score-num\" data-cc-score=\"' + c.id + '\" data-cc-num=\"' + n + '\">' + n + '</button>';
          }).join('')
        + '</div>';
    } else if (c.type === 'numeric') {
      // 数值型：当前值 + 单位 + 30天 sparkline + 输入按钮
      var allNumeric = customEntriesAll(c.id);
      var lastEntry = allNumeric[allNumeric.length - 1];
      var currentVal = lastEntry ? lastEntry.valueNum : null;
      var unit = c.unit || '';
      body = '<div class="cc-numeric__today">当前：<strong>' + (currentVal != null ? currentVal : '—') + '</strong>'
        + (unit ? '<span class="cc-numeric__unit">' + escapeHtml(unit) + '</span>' : '') + '</div>'
        + renderNumericSparkline(allNumeric)
        + '<div class="cc-counter__actions">'
        + '<button type="button" class="cc-plus" data-cc-num="' + c.id + '">记一笔</button>'
        + '<button type="button" class="cc-plus cc-plus--alt" data-cc-num-history="' + c.id + '">历史</button>'
        + '</div>';
    } else if (c.type === 'cycle') {
      // 周期卡：从 kind='cycle' 的条目算规律
      var starts = customEntriesAll(c.id).filter(function(e) {
        return e.kind === 'cycle' && e.date;
      }).map(function(e) { return e.date; }).sort();
      if (starts.length === 0) {
        body = '<div class="cc-cycle__hint muted-tiny">还没记过开始日</div>'
          + '<div class="cc-counter__actions">'
          + '<button type="button" class="cc-plus" data-cc-cycle="' + c.id + '">记开始日</button>'
          + '</div>';
      } else {
        var info = computeCycleInfo(starts);
        var statLine = '';
        if (starts.length >= 2 && info.avg) {
          statLine += '<div class="cc-cycle__stat">平均周期 <strong>' + info.avg + '</strong> 天 · 已记 ' + starts.length + ' 次</div>';
        } else {
          statLine += '<div class="cc-cycle__stat">已记 ' + starts.length + ' 次 · 再记一次就能算规律</div>';
        }
        statLine += '<div class="cc-cycle__now">' + info.nowText + '</div>';
        if (info.nextText) statLine += '<div class="cc-cycle__next">' + info.nextText + '</div>';
        body = statLine
          + '<div class="cc-counter__actions">'
          + '<button type="button" class="cc-plus" data-cc-cycle="' + c.id + '">记开始日</button>'
          + '</div>';
      }
    } else { // text
      var lastText = entries[entries.length - 1];
      body = '<div class=\"cc-text__last\">' + (lastText ? (escapeHtml((lastText.text || '').slice(0, 40)) + ((lastText.text || '').length > 40 ? '…' : '')) : '<span class=\"muted-tiny\">还没有记录</span>') + '</div>'
        + '<div class=\"cc-counter__actions\"><button type=\"button\" class=\"btn btn--primary btn--small\" data-cc-write=\"' + c.id + '\">写一笔</button></div>';
    }
    // Sprint 4：挂目标的卡，显示目标进度
    var goalLine = '';
    if (c.goalId) {
      var hookGoal = loadGoals().find(function(g) { return g.id === c.goalId; });
      if (hookGoal && !hookGoal.completed) {
        goalLine = '<div class="cc-card__goal">⇣ ' + escapeHtml(hookGoal.name)
          + ' · ' + (hookGoal.currentValue || 0) + '/' + (hookGoal.target || '∞')
          + (c.goalDir === 'minus' ? '<span class="cc-card__goal-dir" title="反向：卡片+1，目标进度-1">反</span>' : '')
          + '</div>';
      }
    }
    var lockDot = c.locked ? '<span class=\"cc-card__lock-dot\" title=\"已上锁\">●</span>' : '';
    var relockBtn = c.locked ? '<button type=\"button\" class=\"cc-card__relock\" data-cc-relock=\"' + c.id + '\" title=\"重新上锁\" aria-label=\"重新上锁\">'
      + '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"><rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 018 0v4\"/></svg></button>' : '';
    return '<div class=\"cc-card cc-card--' + c.type + '\" data-card-id=\"' + c.id + '\">'
      + '<div class=\"cc-card__head\"><span class=\"cc-card__name\">' + lockDot + escapeHtml(c.name) + '</span>'
      + '<span class=\"cc-card__actions\">' + relockBtn
      + '<button type=\"button\" class=\"cc-card__del\" data-cc-del=\"' + c.id + '\" aria-label=\"删卡\">×</button>'
      + '</span></div>'
      + body
      + goalLine
      + '</div>';
  }).join('');
}

// 数值型卡 · 30天 sparkline（原生 SVG 折线图）
function renderNumericSparkline(allEntries) {
  if (!allEntries || allEntries.length === 0) {
    return '<div class=\"cc-sparkline cc-sparkline--empty\">还没有数据</div>';
  }
  var byDate = {};
  allEntries.forEach(function(e) {
    if (e.date && e.valueNum != null) byDate[e.date] = e.valueNum;
  });
  var dates = Object.keys(byDate).sort();
  dates = dates.slice(-30);
  if (dates.length < 2) {
    return '<div class=\"cc-sparkline cc-sparkline--empty\">再记一笔就能看见曲线了</div>';
  }
  var values = dates.map(function(d) { return byDate[d]; });
  var vMin = Math.min.apply(null, values);
  var vMax = Math.max.apply(null, values);
  var range = vMax - vMin || 1;
  var w = 240, h = 40, pad = 4;
  var pts = dates.map(function(d, i) {
    var x = pad + (i / (dates.length - 1)) * (w - 2 * pad);
    var y = pad + (1 - (values[i] - vMin) / range) * (h - 2 * pad);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var lastX = pad + (w - 2 * pad);
  var lastY = pad + (1 - (values[values.length - 1] - vMin) / range) * (h - 2 * pad);
  return '<div class=\"cc-sparkline\" aria-label=\"近30天趋势\">'
    + '<svg viewBox=\"0 0 ' + w + ' ' + h + '\" preserveAspectRatio=\"none\" class=\"cc-sparkline__svg\">'
    + '<polyline points=\"' + pts + '\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>'
    + '<circle cx=\"' + lastX.toFixed(1) + '\" cy=\"' + lastY.toFixed(1) + '\" r=\"2.5\" fill=\"currentColor\"/>'
    + '</svg>'
    + '<div class=\"cc-sparkline__range\">低 ' + vMin + ' · 高 ' + vMax + '</div>'
    + '</div>';
}

function customCardIncrement(cardId, delta) {
  var entries = loadCustomEntries();
  entries.push({
    id: uuid(),
    cardId: cardId,
    date: todayKey(),
    time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
    valueNum: delta,
    text: '',
    kind: 'custom'
  });
  saveCustomEntries(entries);
  renderCustomPanel();
  // Sprint 4：挂了目标的卡，顺手把进度也走了
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (card && card.goalId) {
    var amount = card.goalDir === 'minus' ? -delta : delta;
    if (amount !== 0) quickCheckin(card.goalId, amount, null);
  }
}

function customCardScore(cardId, n) {
  var entries = loadCustomEntries();
  entries.push({
    id: uuid(),
    cardId: cardId,
    date: todayKey(),
    time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
    valueNum: n,
    text: '',
    kind: 'custom'
  });
  saveCustomEntries(entries);
  renderCustomPanel();
  showToast('打了 ' + n + ' 分', 'success');
}

function openCustomTextModal(cardId) {
  var cards = loadCustomCards();
  var card = cards.find(function(c) { return c.id === cardId; });
  if (!card) return;
  var modal = document.getElementById('custom-text-modal');
  if (!modal) return;
  document.getElementById('ct-card-id').value = cardId;
  document.getElementById('ct-modal-title').textContent = card.name;
  document.getElementById('ct-field-label').textContent = '在「' + card.name + '」里写一笔';
  document.getElementById('ct-text').value = '';
  openModal(modal);
  setTimeout(function() { document.getElementById('ct-text').focus(); }, 200);
}

function submitCustomText(e) {
  if (e) e.preventDefault();
  var cardId = document.getElementById('ct-card-id').value;
  var text = (document.getElementById('ct-text').value || '').trim();
  if (!text) {
    document.getElementById('ct-text').classList.add('field__input--error');
    setTimeout(function() { document.getElementById('ct-text').classList.remove('field__input--error'); }, 1200);
    return;
  }
  var entries = loadCustomEntries();
  entries.push({
    id: uuid(),
    cardId: cardId,
    date: todayKey(),
    time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
    valueNum: null,
    text: text,
    kind: 'custom'
  });
  saveCustomEntries(entries);
  document.getElementById('custom-text-modal').hidden = true;
  renderCustomPanel();
  showToast('记下了', 'success');
}

function openCustomCardModal() {
  var modal = document.getElementById('custom-card-modal');
  if (!modal) return;
  document.getElementById('cc-name').value = '';
  document.getElementById('cc-type').value = 'counter';
  document.getElementById('cc-name-error').textContent = '';
  // Sprint 4：填充可挂钩的目标（走量型、未完成的）
  var goalSel = document.getElementById('cc-goal');
  if (goalSel) {
    var hookable = loadGoals().filter(function(g) {
      return g.type !== 'milestone' && !g.completed && !g.paused;
    });
    goalSel.innerHTML = '<option value="">不挂，就单纯记个次数</option>'
      + hookable.map(function(g) {
          return '<option value="' + g.id + '">' + escapeHtml(g.name) + '（' + (g.currentValue || 0) + '/' + (g.target || '∞') + '）</option>';
        }).join('');
    goalSel.value = '';
  }
  var dirField = document.getElementById('cc-goal-dir-field');
  if (dirField) dirField.hidden = true;
  openModal(modal);
  setTimeout(function() { document.getElementById('cc-name').focus(); }, 200);
}

function submitCustomCard(e) {
  if (e) e.preventDefault();
  var name = (document.getElementById('cc-name').value || '').trim();
  var type = document.getElementById('cc-type').value;
  var errEl = document.getElementById('cc-name-error');
  if (!name) {
    errEl.textContent = '给它起个名字吧，不然记了都不知道是谁';
    document.getElementById('cc-name').classList.add('field__input--error');
    setTimeout(function() { document.getElementById('cc-name').classList.remove('field__input--error'); }, 1500);
    return;
  }
  // 数值型：单位（选填）
  var unit = type === 'numeric' ? (document.getElementById('cc-unit').value || '').trim() : '';
  // 上锁：勾选 + 4 位 PIN 校验
  var locked = document.getElementById('cc-locked').checked;
  var pinHash = '';
  var pinErr = document.getElementById('cc-pin-error');
  pinErr.textContent = '';
  if (locked) {
    var pin1 = document.getElementById('cc-pin').value || '';
    var pin2 = document.getElementById('cc-pin2').value || '';
    if (!/^[0-9]{4}$/.test(pin1)) {
      pinErr.textContent = 'PIN 要 4 位数字';
      return;
    }
    if (pin1 !== pin2) {
      pinErr.textContent = '两次输入不一样';
      return;
    }
    pinHash = simpleHashPin(pin1);
  }
  var cards = loadCustomCards();
  // Sprint 4：挂目标（仅计数型） + 方向
  var goalId = '';
  var goalDir = 'plus';
  if (type === 'counter') {
    goalId = (document.getElementById('cc-goal') && document.getElementById('cc-goal').value) || '';
    goalDir = (document.getElementById('cc-goal-dir') && document.getElementById('cc-goal-dir').value) || 'plus';
    if (goalId && !loadGoals().some(function(g) { return g.id === goalId; })) goalId = '';
  }
  cards.push({
    id: uuid(),
    name: name,
    type: type,
    unit: unit,
    locked: locked,
    pinHash: pinHash,
    goalId: goalId,
    goalDir: goalId ? goalDir : '',
    createdAt: new Date().toISOString()
  });
  saveCustomCards(cards);
  document.getElementById('custom-card-modal').hidden = true;
  renderCustomPanel();
  showToast('卡片「' + name + '」已开' + (locked ? '，记得 4 位 PIN' : '') + (goalId ? '，顺手挂上了目标' : ''), 'success');
}

function deleteCustomCard(cardId) {
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (!card) return;
  confirmDelete('删掉「' + card.name + '」卡片？', '卡里的历史记录会一直躺在你的数据里，不会被删', function() {
    var cards = loadCustomCards().filter(function(c) { return c.id !== cardId; });
    saveCustomCards(cards);
    lockCard(cardId); // 清掉 sessionStorage 里的解锁态
    renderCustomPanel();
    showToast('卡片删了', 'info');
  });
}

// ---- 单卡解锁弹窗 ----
var _ccUnlockCardId = null;
var _ccUnlockPinBuf = '';

function openUnlockModal(cardId) {
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (!card) return;
  _ccUnlockCardId = cardId;
  _ccUnlockPinBuf = '';
  document.getElementById('cc-unlock-title').textContent = '解锁「' + card.name + '」';
  document.getElementById('cc-unlock-error').textContent = '';
  paintPinDisplay();
  openModal(document.getElementById('cc-unlock-modal'));
}

function paintPinDisplay() {
  var dots = document.querySelectorAll('#cc-unlock-display .pin-dot');
  dots.forEach(function(dot, i) {
    if (i < _ccUnlockPinBuf.length) dot.classList.add('pin-dot--filled');
    else dot.classList.remove('pin-dot--filled');
  });
}

function pushPinDigit(d) {
  if (_ccUnlockPinBuf.length >= 4) return;
  if (!/^[0-9]$/.test(d)) return;
  _ccUnlockPinBuf += d;
  paintPinDisplay();
  document.getElementById('cc-unlock-error').textContent = '';
  if (_ccUnlockPinBuf.length === 4) {
    // 立即校验
    var card = loadCustomCards().find(function(c) { return c.id === _ccUnlockCardId; });
    if (card && verifyPin(_ccUnlockPinBuf, card.pinHash)) {
      markCardUnlocked(_ccUnlockCardId);
      document.getElementById('cc-unlock-modal').hidden = true;
      renderCustomPanel();
      showToast('解锁了', 'success');
    } else {
      var errEl = document.getElementById('cc-unlock-error');
      errEl.textContent = '不对，再试一次';
      errEl.classList.add('field__error--shake');
      setTimeout(function() { errEl.classList.remove('field__error--shake'); }, 600);
      // 错后等一会儿再清空，让用户看到错误
      setTimeout(function() { _ccUnlockPinBuf = ''; paintPinDisplay(); }, 600);
    }
  }
}

function popPinDigit() {
  if (_ccUnlockPinBuf.length === 0) return;
  _ccUnlockPinBuf = _ccUnlockPinBuf.slice(0, -1);
  paintPinDisplay();
  document.getElementById('cc-unlock-error').textContent = '';
}

// ---- 数值型卡片输入弹窗 ----
function openNumericInputModal(cardId) {
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (!card) return;
  document.getElementById('cc-num-card-id').value = cardId;
  document.getElementById('cc-num-title').textContent = '记一笔「' + card.name + '」';
  document.getElementById('cc-num-unit').textContent = card.unit || '';
  document.getElementById('cc-num-value').value = '';
  document.getElementById('cc-num-note').value = '';
  openModal(document.getElementById('cc-numeric-modal'));
  setTimeout(function() { document.getElementById('cc-num-value').focus(); }, 200);
}

function submitNumericEntry(e) {
  if (e) e.preventDefault();
  var cardId = document.getElementById('cc-num-card-id').value;
  var raw = (document.getElementById('cc-num-value').value || '').trim();
  var note = (document.getElementById('cc-num-note').value || '').trim();
  if (!raw) {
    document.getElementById('cc-num-value').classList.add('field__input--error');
    setTimeout(function() { document.getElementById('cc-num-value').classList.remove('field__input--error'); }, 1200);
    return;
  }
  var valueNum = parseFloat(raw);
  if (isNaN(valueNum)) return;
  var entries = loadCustomEntries();
  entries.push({
    id: uuid(),
    cardId: cardId,
    date: todayKey(),
    time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
    valueNum: valueNum,
    text: note,
    kind: 'custom'
  });
  saveCustomEntries(entries);
  document.getElementById('cc-numeric-modal').hidden = true;
  renderCustomPanel();
  showToast('记下了', 'success');
}

function openNumericHistoryModal(cardId) {
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (!card) return;
  var entries = customEntriesAll(cardId).slice().reverse().slice(0, 50);
  var body = entries.length === 0
    ? '<div class="muted-tiny">还没有记录</div>'
    : '<ul class="cc-history__list">' + entries.map(function(e) {
        var note = e.text ? ' · ' + escapeHtml(e.text) : '';
        return '<li><span class="cc-history__date">' + e.date + ' ' + (e.time || '') + '</span>'
          + '<span class="cc-history__val">' + e.valueNum + (card.unit ? ' ' + escapeHtml(card.unit) : '') + note + '</span></li>';
      }).join('') + '</ul>';
  // 复用 custom-text-modal 来展示历史，最简实现
  var modal = document.getElementById('custom-text-modal');
  if (!modal) return;
  document.getElementById('ct-card-id').value = '';
  document.getElementById('ct-modal-title').textContent = '「' + card.name + '」历史';
  document.getElementById('ct-field-label').textContent = '最近 ' + entries.length + ' 条';
  var ta = document.getElementById('ct-text');
  ta.value = '';
  ta.readOnly = true;
  ta.style.display = 'none';
  // 把历史 list 渲染到一个临时 div
  var hint = modal.querySelector('.cc-history__wrap');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'cc-history__wrap';
    var label = modal.querySelector('.field');
    if (label) label.parentNode.insertBefore(hint, label.nextSibling);
  }
  hint.innerHTML = body;
  openModal(modal);
}

function relockCustomCard(cardId) {
  lockCard(cardId);
  renderCustomPanel();
  showToast('已上锁', 'info');
}

// ---- 记梦 ----
function openDreamModal() {
  var modal = document.getElementById('dream-modal');
  if (!modal) return;
  document.getElementById('dream-text').value = '';
  openModal(modal);
  setTimeout(function() { document.getElementById('dream-text').focus(); }, 200);
}

function submitDream(e) {
  if (e) e.preventDefault();
  var text = (document.getElementById('dream-text').value || '').trim();
  if (!text) {
    document.getElementById('dream-text').classList.add('field__input--error');
    setTimeout(function() { document.getElementById('dream-text').classList.remove('field__input--error'); }, 1500);
    return;
  }
  var entries = loadCustomEntries();
  entries.push({
    id: uuid(),
    cardId: 'dream',
    date: todayKey(),
    time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
    valueNum: null,
    text: text,
    kind: 'dream'
  });
  saveCustomEntries(entries);
  document.getElementById('dream-modal').hidden = true;
  renderSleepPanel();
  showToast('梦记下了', 'success');
}

// ---- ＋ 抽屉联通 ----
function routeQuickAction(quickKey) {
  switch (quickKey) {
    case 'schedule':
      openScheduleModal(null);
      return true;
    case 'sleep':
      // 切到首页 + 滑到右上睡眠屏
      var sleepPanel = document.querySelector('[data-quad=\"sleep\"]');
      if (sleepPanel) {
        var swipe = sleepPanel.querySelector('.quad-swipe');
        if (swipe) swipe.scrollLeft = 0;
      }
      showToast('好，填一下昨晚的', 'info');
      return true;
    case 'note':
      // 找一张文字型卡片，没有就引导开卡
      var textCard = loadCustomCards().find(function(c) { return c.type === 'text'; });
      if (textCard) {
        openCustomTextModal(textCard.id);
      } else {
        showToast('先在「自定义」开一张「文字」型卡片，再来这里写', 'info');
        openCustomCardModal();
      }
      return true;
    case 'custom':
      openCustomManage();
      return true;
    case 'money':
      // Sprint 4：真接通了——锁着先解锁，解锁了直接记一笔
      if (!isFinanceVisible()) openFinUnlockModal();
      else openFinanceModal();
      return true;
  }
  return false;
}

function openCustomManage() {
  var modal = document.getElementById('custom-manage-modal');
  if (!modal) return;
  var list = document.getElementById('cc-manage-list');
  if (list) {
    var cards = loadCustomCards();
    if (cards.length === 0) {
      list.innerHTML = '<p class=\"muted-tiny\">还没有卡片</p>';
    } else {
      list.innerHTML = cards.map(function(c, idx) {
        var entries = customEntriesAll(c.id);
        var typeLabel = { counter: '计数', score: '打分', text: '文字', numeric: '数值', cycle: '周期' }[c.type] || '记录';
        return '<div class=\"cc-manage__row\">'
          + '<span class=\"cc-manage__sort\">'
          + '<button type=\"button\" class=\"icon-btn\" data-cc-up=\"' + c.id + '\" aria-label=\"上移\" title=\"上移\"' + (idx === 0 ? ' disabled' : '') + '>↑</button>'
          + '<button type=\"button\" class=\"icon-btn\" data-cc-down=\"' + c.id + '\" aria-label=\"下移\" title=\"下移\"' + (idx === cards.length - 1 ? ' disabled' : '') + '>↓</button>'
          + '</span>'
          + '<span class=\"cc-manage__name\">' + escapeHtml(c.name) + '</span>'
          + '<span class=\"cc-manage__type\">' + typeLabel + '</span>'
          + '<span class=\"cc-manage__count\">' + entries.length + ' 条</span>'
          + '<button type=\"button\" class=\"icon-btn\" data-cc-del-mng=\"' + c.id + '\" aria-label=\"删\">×</button>'
          + '</div>';
      }).join('');
    }
  }
  openModal(modal);
}

// ---- init 扩展 ----
function initSprint3() {
  renderSleepPanel();
  renderDietPanel();
  renderCustomPanel();

  // 睡眠表单提交
  var sleepForm = document.getElementById('sleep-form');
  if (sleepForm) sleepForm.addEventListener('submit', saveSleepFromForm);

  // 记梦
  var dreamBtn = document.getElementById('sleep-dream-btn');
  if (dreamBtn) dreamBtn.addEventListener('click', openDreamModal);
  var dreamForm = document.getElementById('dream-form');
  if (dreamForm) dreamForm.addEventListener('submit', submitDream);

  // 饮食三餐
  ['breakfast','lunch','dinner','snack'].forEach(function(m) {
    var btn = document.getElementById('diet-add-' + m);
    if (btn) btn.addEventListener('click', function() { addDietEntry(m); });
    var input = document.getElementById('diet-input-' + m);
    if (input) input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addDietEntry(m); }
    });
  });

  // 自定义卡片：新建 / 删除 / 计数 / 打分 / 写
  var ccNewBtn = document.getElementById('cc-new-btn');
  if (ccNewBtn) ccNewBtn.addEventListener('click', openCustomCardModal);
  var ccForm = document.getElementById('custom-card-form');
  if (ccForm) ccForm.addEventListener('submit', submitCustomCard);
  var ctForm = document.getElementById('custom-text-form');
  if (ctForm) ctForm.addEventListener('submit', submitCustomText);

  // 数值型单位字段 + 上锁 PIN 字段 联动
  var ccTypeEl = document.getElementById('cc-type');
  if (ccTypeEl) ccTypeEl.addEventListener('change', function() {
    var unitField = document.getElementById('cc-unit-field');
    if (unitField) unitField.hidden = (ccTypeEl.value !== 'numeric');
  });
  var ccLockedEl = document.getElementById('cc-locked');
  if (ccLockedEl) ccLockedEl.addEventListener('change', function() {
    var pinField = document.getElementById('cc-pin-field');
    if (pinField) pinField.hidden = !ccLockedEl.checked;
  });

  // 数值型输入表单
  var ccNumForm = document.getElementById('cc-numeric-form');
  if (ccNumForm) ccNumForm.addEventListener('submit', submitNumericEntry);

  // PIN 键盘
  var pinKeys = document.querySelectorAll('#cc-unlock-modal .pin-key');
  pinKeys.forEach(function(k) {
    k.addEventListener('click', function() {
      var v = k.dataset.pin;
      if (v === 'del') popPinDigit();
      else pushPinDigit(v);
    });
  });

  // 预设芯片
  document.querySelectorAll('.preset-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var n = chip.dataset.preset || '';
      var nameEl = document.getElementById('cc-name');
      if (nameEl) nameEl.value = n;
      if (n.indexOf('打分') >= 0) document.getElementById('cc-type').value = 'score';
      else if (n.indexOf('计数') >= 0) document.getElementById('cc-type').value = 'counter';
      else if (n.indexOf('文字') >= 0) document.getElementById('cc-type').value = 'text';
    });
  });

  // 卡片管理弹窗的「再开一张」
  var ccManageAdd = document.getElementById('cc-manage-add');
  if (ccManageAdd) ccManageAdd.addEventListener('click', function() {
    document.getElementById('custom-manage-modal').hidden = true;
    openCustomCardModal();
  });
}

// ============================================================
// 初始化
// ============================================================

function init() {
  loadTheme();
  initMottos();
  updateTopbarName();

  // 同行者：静默初始化云端（匿名登录，界面无感知）
  if (window.syncAdapter) {
    syncAdapter.init().then(function(ok) {
      if (ok) {
        console.log('[LifeOS] 同行者云端已连接，uid:', syncAdapter.getUid());
        syncAdapter.cleanExpiredRooms();
        checkCompanionEnded();
      }
    });
    // 待同步队列变化时刷新目标列表
    window._lifeosSyncQueueChanged = function() {
      if (document.querySelector('.view--active[data-view="goals"]')) {
        renderGoals();
      }
      updateCompanionStatusText();
    };
  }

  // 检查是否首次使用
  var onboarded = localStorage.getItem(STORAGE_ONBOARDED);
  if (!onboarded) {
    startOnboarding();
    // 首次使用时不执行常规初始化（onboarding 完成后会刷新）
    // 但仍需绑定导航等基础交互
    bindBasicInteractions();
    initDashboard();
    initSprint3();
    initSprint4();
    initSprint5();
    return;
  }

  // Sprint 5：先看板锁。锁着时，先不渲染任何内容
  if (isAppLocked() && !isAppUnlockedThisSession()) {
    showAppLockScreen('unlock');
    _bindLockKeys();
    return;
  }

  renderTodayBoard();
  checkRetentionHook();
  checkReminders();
  bindBasicInteractions();
  initDashboard();
  initSprint3();
  initSprint4();
  initSprint5();
}

function bindBasicInteractions() {

  // 导航（已改为 button）
  document.querySelectorAll('.nav__item').forEach(function(item) {
    item.addEventListener('click', function() {
      switchView(item.dataset.nav);
    });
  });

  // 首页卡片跳转（已改为 div + role=button）
  document.querySelectorAll('.card[data-module]').forEach(function(card) {
    card.addEventListener('click', function(e) {
      // 如果点击的是 motto 编辑区域，不跳转
      if (e.target.closest('.motto-wrap')) return;
      switchView(card.dataset.module);
    });
    // 键盘支持
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.motto-wrap')) return;
        e.preventDefault();
        switchView(card.dataset.module);
      }
    });
  });

  // 返回按钮
  document.querySelectorAll('.btn--back').forEach(function(btn) {
    btn.addEventListener('click', function() { switchView(btn.dataset.back); });
  });

  // 目标
  initGoalModal();
  initDecomposeWizard();
  initGoalTeaching();
  document.getElementById('goal-detail-modal').querySelectorAll('[data-close-detail]').forEach(function(el) {
    el.addEventListener('click', function() {
      closeAnyModal(document.getElementById('goal-detail-modal'));
    });
  });

  // 贵人
  initNobleModal();
  document.getElementById('noble-detail-modal').querySelectorAll('[data-close-noble-detail]').forEach(function(el) {
    el.addEventListener('click', function() {
      closeAnyModal(document.getElementById('noble-detail-modal'));
    });
  });

  // 既往也咎 tabs（带 localStorage 记忆）
  var savedTab = localStorage.getItem(STORAGE_PAST_TAB) || 'timeline';
  document.querySelectorAll('.tab').forEach(function(tab) {
    // 恢复上次 tab
    var isActive = tab.dataset.tab === savedTab;
    tab.classList.toggle('tab--active', isActive);
    document.querySelectorAll('.tab-panel').forEach(function(p) {
      p.classList.toggle('tab-panel--active', p.dataset.panel === savedTab);
    });

    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('tab--active'); });
      tab.classList.add('tab--active');
      var tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(function(p) {
        p.classList.toggle('tab-panel--active', p.dataset.panel === tabName);
      });
      // 记忆
      localStorage.setItem(STORAGE_PAST_TAB, tabName);
    });
  });

  // 确认弹窗关闭
  var confirmModal = document.getElementById('confirm-modal');
  confirmModal.querySelectorAll('[data-close-confirm]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(confirmModal); });
  });

  // 弹窗
  initTimelineModal();
  initLessonModal();
  initReviewModal();
  initCapsuleModal();
  initThemeModal();

  // 全局 Esc 关闭确认弹窗
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (!confirmModal.hidden) {
        closeAnyModal(confirmModal);
      }
      var decomposeModal = document.getElementById('decompose-modal');
      if (decomposeModal && !decomposeModal.hidden) {
        if (window._closeDecomposeWizard) window._closeDecomposeWizard();
      }
      var coachOverlay = document.getElementById('coach-overlay');
      if (coachOverlay && !coachOverlay.hidden) {
        coachOverlay.hidden = true;
        localStorage.setItem(STORAGE_COACH_SHOWN, '1');
      }
    }
  });

  // coach mask 点击关闭
  var coachMask = document.getElementById('coach-mask');
  if (coachMask) {
    coachMask.addEventListener('click', function() {
      var coachOverlay = document.getElementById('coach-overlay');
      if (coachOverlay) {
        coachOverlay.hidden = true;
        localStorage.setItem(STORAGE_COACH_SHOWN, '1');
      }
    });
  }

  // 回到第0天（重看引导）
  var replayLink = document.getElementById('replay-onboard-link');
  if (replayLink) {
    replayLink.addEventListener('click', function() {
      localStorage.removeItem(STORAGE_ONBOARDED);
      location.reload();
    });
  }

  // 重开目标教学
  var resetTeachingLink = document.getElementById('reset-teaching-link');
  if (resetTeachingLink) {
    resetTeachingLink.addEventListener('click', function() {
      resetGoalTeaching();
    });
  }

  // 同行者
  initCompanion();
}

// ============================================================
// 皮肤系统
// ============================================================

var THEMES = {
  default: {
    '--c-accent': '#38bdf8',
    '--c-accent-2': '#0ea5e9',
    '--c-accent-soft': 'rgba(56, 189, 248, 0.12)',
    '--bg-page': '#0c1222',
    '--bg-modal': '#151c30',
    '--bg-overlay': 'rgba(12, 18, 34, 0.92)',
  },
  ink: {
    '--c-accent': '#e5e5e5',
    '--c-accent-2': '#a3a3a3',
    '--c-accent-soft': 'rgba(229, 229, 229, 0.08)',
    '--bg-page': '#0a0a0a',
    '--bg-modal': '#1a1a1a',
    '--bg-overlay': 'rgba(10, 10, 10, 0.92)',
  },
  bamboo: {
    '--c-accent': '#4ade80',
    '--c-accent-2': '#22c55e',
    '--c-accent-soft': 'rgba(74, 222, 128, 0.12)',
    '--bg-page': '#0d1a14',
    '--bg-modal': '#13261c',
    '--bg-overlay': 'rgba(13, 26, 20, 0.92)',
  },
  apricot: {
    '--c-accent': '#fbbf24',
    '--c-accent-2': '#f59e0b',
    '--c-accent-soft': 'rgba(251, 191, 36, 0.12)',
    '--bg-page': '#1a1410',
    '--bg-modal': '#241c16',
    '--bg-overlay': 'rgba(26, 20, 16, 0.92)',
  },
  mist: {
    '--c-accent': '#a78bfa',
    '--c-accent-2': '#8b5cf6',
    '--c-accent-soft': 'rgba(167, 139, 250, 0.12)',
    '--bg-page': '#13101a',
    '--bg-modal': '#1c1828',
    '--bg-overlay': 'rgba(19, 16, 26, 0.92)',
  },
  blackgold: {
    '--c-accent': '#d4af37',
    '--c-accent-2': '#b8942f',
    '--c-accent-soft': 'rgba(212, 175, 55, 0.14)',
    '--bg-page': '#0d0b08',
    '--bg-modal': '#191510',
    '--bg-overlay': 'rgba(13, 11, 8, 0.94)',
    '--nav-bg': 'rgba(13, 11, 8, 0.92)',
    '--border': 'rgba(212, 175, 55, 0.10)',
    '--border-strong': 'rgba(212, 175, 55, 0.22)',
    '--bg-card': 'rgba(212, 175, 55, 0.04)',
    '--bg-card-2': 'rgba(212, 175, 55, 0.08)',
  },
};

function applyTheme(themeName) {
  var root = document.documentElement;
  var theme = THEMES[themeName] || THEMES.default;
  // 先清掉所有主题可能写过的变量，避免换主题时残留上一个的颜色
  Object.keys(THEMES).forEach(function(name) {
    Object.keys(THEMES[name]).forEach(function(key) {
      root.style.removeProperty(key);
    });
  });
  Object.keys(theme).forEach(function(key) {
    root.style.setProperty(key, theme[key]);
  });
  // 同步更新 body 背景色
  document.body.style.backgroundColor = theme['--bg-page'];
  // 更新激活态
  document.querySelectorAll('.theme-swatch').forEach(function(s) {
    s.classList.toggle('theme-swatch--active', s.dataset.theme === themeName);
  });
}

function applyPhotoBackground(base64) {
  var layer = document.querySelector('.bg-photo-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bg-photo-layer';
    document.body.insertBefore(layer, document.body.firstChild);
  }
  layer.style.backgroundImage = 'url(' + base64 + ')';
  document.body.classList.add('has-photo');
}

function removePhotoBackground() {
  var layer = document.querySelector('.bg-photo-layer');
  if (layer) layer.remove();
  document.body.classList.remove('has-photo');
}

function loadTheme() {
  var saved = loadJSON(STORAGE_THEME, {});
  // 应用预设主题（黑金为融合版默认皮肤）
  if (saved.preset && THEMES[saved.preset]) {
    applyTheme(saved.preset);
  } else {
    applyTheme('blackgold');
  }
  // 应用照片背景
  if (saved.photo) {
    applyPhotoBackground(saved.photo);
  }
  // 更新移除按钮状态
  var removeBtn = document.getElementById('theme-photo-remove');
  if (removeBtn) removeBtn.hidden = !saved.photo;
}

function saveTheme(data) {
  saveJSON(STORAGE_THEME, data);
}

// Canvas 压缩图片到最长边1600px的JPEG base64
function compressImage(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxSide = 1600;
      var w = img.width, h = img.height;
      if (w > maxSide || h > maxSide) {
        if (w >= h) {
          h = Math.round(h * maxSide / w);
          w = maxSide;
        } else {
          w = Math.round(w * maxSide / h);
          h = maxSide;
        }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var base64 = canvas.toDataURL('image/jpeg', 0.85);
      callback(base64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initThemeModal() {
  var modal = document.getElementById('theme-modal');
  var themeBtn = document.getElementById('theme-btn');
  if (!modal || !themeBtn) return;

  // 打开弹窗
  themeBtn.addEventListener('click', function() {
    modal.hidden = false;
    trapFocus(modal);
  });

  // 关闭
  modal.querySelectorAll('[data-close-theme]').forEach(function(el) {
    el.addEventListener('click', function() { closeAnyModal(modal); });
  });

  // 预设主题切换
  modal.querySelectorAll('.theme-swatch').forEach(function(swatch) {
    swatch.addEventListener('click', function() {
      var themeName = swatch.dataset.theme;
      applyTheme(themeName);
      var saved = loadJSON(STORAGE_THEME, {});
      saved.preset = themeName;
      saveTheme(saved);
      showToast('主题已切换', 'success');
    });
  });

  // 照片上传
  var photoBtn = document.getElementById('theme-photo-btn');
  var photoInput = document.getElementById('theme-photo-input');
  var removeBtn = document.getElementById('theme-photo-remove');

  if (photoBtn && photoInput) {
    photoBtn.addEventListener('click', function() {
      photoInput.click();
    });
    photoInput.addEventListener('change', function() {
      var file = photoInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast('图片不能超过10MB', 'warning');
        return;
      }
      compressImage(file, function(base64) {
        applyPhotoBackground(base64);
        var saved = loadJSON(STORAGE_THEME, {});
        saved.photo = base64;
        saveTheme(saved);
        if (removeBtn) removeBtn.hidden = false;
        showToast('背景照片已设置', 'success');
      });
      photoInput.value = '';
    });
  }

  // 移除照片
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      removePhotoBackground();
      var saved = loadJSON(STORAGE_THEME, {});
      delete saved.photo;
      saveTheme(saved);
      removeBtn.hidden = true;
      showToast('已恢复默认背景', 'success');
    });
  }
}

// ============================================================
// 同行者 — 双人连接
// localStorage 永远是唯一真相源，云端只是镜像
// ============================================================

// 打开弹窗辅助
function openModal(modal) {
  modal.hidden = false;
  trapFocus(modal);
}

// ---- 构建共享数据（云端只存：目标名、类型、进度百分比、今日打卡状态）----
function buildShareData() {
  var goals = loadGoals();
  var settings = loadJSON(STORAGE_SHARE_SETTINGS, { goalShares: {}, showTodayStatus: true });
  var today = todayKey();
  var partner = loadJSON(STORAGE_PARTNER, null);

  var sharedGoals = goals
    .filter(function(g) { return !g.completed; })
    .filter(function(g) { return settings.goalShares ? settings.goalShares[g.id] !== false : true; })
    .map(function(g) {
      var checkedToday = (g.checkins || []).some(function(c) { return c.date === today; });
      return {
        id: g.id,
        name: g.name,
        type: g.type,
        progress: Math.round(calcProgress(g) * 100) / 100,
        checkedToday: settings.showTodayStatus !== false ? checkedToday : false,
        shared: true
      };
    });

  var hiddenGoals = goals
    .filter(function(g) { return !g.completed; })
    .filter(function(g) { return settings.goalShares ? settings.goalShares[g.id] === false : false; })
    .map(function(g) {
      return { id: g.id, name: g.name, type: g.type, progress: 0, checkedToday: false, shared: false };
    });

  // 打卡日期（最近30天，用于双人连续天数）
  var checkinDates = [];
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var cutoffStr = formatDate(cutoff.toISOString());
  goals.forEach(function(g) {
    (g.checkins || []).forEach(function(c) {
      if (c.date && c.date >= cutoffStr && checkinDates.indexOf(c.date) === -1) checkinDates.push(c.date);
    });
    if (g.children) {
      g.children.forEach(function(child) {
        (child.checkins || []).forEach(function(c) {
          if (c.date && c.date >= cutoffStr && checkinDates.indexOf(c.date) === -1) checkinDates.push(c.date);
        });
      });
    }
  });
  checkinDates.sort();

  return {
    partnerUid: partner ? partner.uid : null,
    roomId: partner ? partner.roomId : null,
    name: getUserName() || '匿名',
    goals: sharedGoals.concat(hiddenGoals),
    showTodayStatus: settings.showTodayStatus !== false,
    checkinDates: checkinDates,
    lastActive: today,
    lastUpdated: Date.now()
  };
}

// ---- 推送共享数据到云端（离线优先，失败入队）----
function syncToCloud(goalId) {
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) return; // 未连接同行者，不推送
  if (!window.syncAdapter) return;
  var shareData = buildShareData();
  syncAdapter.pushProgress(shareData, goalId);
}

// ---- 更新首页同行者卡片状态 ----
function updateCompanionStatusText() {
  var el = document.getElementById('companion-status-text');
  if (!el) return;
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (partner && partner.uid) {
    var pending = window.syncAdapter && syncAdapter.hasAnyPending();
    el.textContent = '与「' + (partner.name || 'TA') + '」同行中' + (pending ? ' · 待同步' : '');
  } else {
    el.textContent = '一个人也可以走，两个人走得更远';
  }
}

// ---- 获取自己的打卡日期（最近30天）----
function getMyCheckinDates() {
  var goals = loadGoals();
  var dates = [];
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var cutoffStr = formatDate(cutoff.toISOString());
  goals.forEach(function(g) {
    (g.checkins || []).forEach(function(c) {
      if (c.date && c.date >= cutoffStr && dates.indexOf(c.date) === -1) dates.push(c.date);
    });
    if (g.children) {
      g.children.forEach(function(child) {
        (child.checkins || []).forEach(function(c) {
          if (c.date && c.date >= cutoffStr && dates.indexOf(c.date) === -1) dates.push(c.date);
        });
      });
    }
  });
  dates.sort();
  return dates;
}

// ---- 计算双人连续天数 ----
function calcDualStreak(myDates, partnerDates) {
  var mySet = {}, partnerSet = {};
  myDates.forEach(function(d) { mySet[d] = true; });
  partnerDates.forEach(function(d) { partnerSet[d] = true; });

  var cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  var todayStr = formatDate(cursor.toISOString());
  if (!(mySet[todayStr] && partnerSet[todayStr])) {
    cursor.setDate(cursor.getDate() - 1);
  }
  var streak = 0;
  while (true) {
    var dateStr = formatDate(cursor.toISOString());
    if (mySet[dateStr] && partnerSet[dateStr]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

// ---- 同行者页面渲染 ----
function renderCompanion() {
  var container = document.getElementById('companion-content');
  if (!container) return;

  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) {
    container.innerHTML =
      '<div class="companion-empty">' +
        '<div class="companion-empty__icon">🔗</div>' +
        '<div class="companion-empty__title">找个人一起走</div>' +
        '<div class="companion-empty__desc">同行者互相看见进度，互相打气。<br>不用加微信，不用知道是谁，用暗号连上就行。</div>' +
        '<button class="companion-empty__btn" id="companion-start-connect" type="button">开始连接</button>' +
      '</div>';
    var btn = container.querySelector('#companion-start-connect');
    if (btn) btn.addEventListener('click', function() {
      openModal(document.getElementById('companion-connect-modal'));
    });
    return;
  }

  // 已连接 — 拉取对方数据
  container.innerHTML =
    '<div class="companion-today" style="justify-content:center">' +
      '<span class="companion-waiting__spinner"></span>' +
      '<span style="margin-left:8px;font-size:13px;color:var(--text-3)">正在获取TA的最新动态…</span>' +
    '</div>';

  if (window.syncAdapter && syncAdapter.isReady()) {
    syncAdapter.fetchPartner().then(function(partnerData) {
      renderCompanionConnected(partner, partnerData);
      syncAdapter.fetchCheers().then(function(cheers) {
        renderReceivedCheers(cheers);
        var unreadIds = cheers.filter(function(c) { return !c.read && c.message !== '__ENDED__'; }).map(function(c) { return c._id; });
        if (unreadIds.length > 0) syncAdapter.markCheersRead(unreadIds);
      });
    });
  } else {
    renderCompanionConnected(partner, null);
  }
}

function renderCompanionConnected(partner, partnerData) {
  var container = document.getElementById('companion-content');
  if (!container) return;

  var myDates = getMyCheckinDates();
  var partnerDates = (partnerData && partnerData.checkinDates) ? partnerData.checkinDates : [];
  var dualStreak = calcDualStreak(myDates, partnerDates);

  var today = todayKey();
  var myCheckedToday = myDates.indexOf(today) >= 0;
  var partnerCheckedToday = partnerDates.indexOf(today) >= 0;
  var partnerLastActive = partnerData ? partnerData.lastActive : null;
  var partnerDaysSince = partnerLastActive ? daysBetween(partnerLastActive, today) : 999;

  var html = '';

  // 头部
  var connectedDate = partner.connectedAt || today;
  var daysTogether = Math.max(1, daysBetween(connectedDate, today) + 1);
  html += '<div class="companion-header">';
  html += '<div>';
  html += '<div class="companion-header__name">' + escapeHtml(partner.name || 'TA') + '</div>';
  html += '<div class="companion-header__since">已同行 ' + daysTogether + ' 天</div>';
  html += '</div>';
  html += '<div class="companion-header__actions">';
  html += '<button class="btn btn--ghost btn--small" id="companion-share-settings-btn" type="button">共享设置</button>';
  html += '</div>';
  html += '</div>';

  // 今日同行状态
  html += '<div class="companion-today">';
  if (myCheckedToday && partnerCheckedToday) {
    html += '<div class="companion-today__icon companion-today__icon--both">✓</div>';
    html += '<div class="companion-today__text">今天你们都在 <strong>✓</strong></div>';
  } else if (myCheckedToday && !partnerCheckedToday) {
    html += '<div class="companion-today__icon companion-today__icon--waiting">⏳</div>';
    html += '<div class="companion-today__text">你今天打卡了，<strong>TA还没出现</strong></div>';
  } else if (!myCheckedToday && partnerCheckedToday) {
    html += '<div class="companion-today__icon companion-today__icon--waiting">⏳</div>';
    html += '<div class="companion-today__text">TA今天打卡了，<strong>该你了</strong></div>';
  } else {
    html += '<div class="companion-today__icon companion-today__icon--waiting">🌙</div>';
    html += '<div class="companion-today__text">今天你们都还没打卡</div>';
  }
  html += '</div>';

  // 双人连续天数
  html += '<div class="companion-streak">';
  html += '<div class="companion-streak__num">' + dualStreak + '</div>';
  html += '<div class="companion-streak__label">天连续同行</div>';
  html += '</div>';

  // 对方的目标
  html += '<div class="companion-goals">';
  html += '<div class="companion-goals__title">TA的目标</div>';
  if (partnerData && partnerData.goals && partnerData.goals.length > 0) {
    partnerData.goals.forEach(function(g) {
      var pct = Math.round((g.progress || 0) * 100);
      if (g.shared === false) {
        html += '<div class="companion-goal-row companion-goal-row--hidden">';
        html += '<span class="companion-goal-row__name">这个目标被TA藏起来了</span>';
        html += '<div class="companion-goal-row__bar"><div class="companion-goal-row__bar-fill" style="width:0%"></div></div>';
        html += '<span class="companion-goal-row__status">—</span>';
        html += '</div>';
      } else {
        var statusHTML = g.checkedToday
          ? '<span class="companion-goal-row__status companion-goal-row__status--done">今日✓</span>'
          : '<span class="companion-goal-row__status">' + pct + '%</span>';
        html += '<div class="companion-goal-row">';
        html += '<span class="companion-goal-row__name">' + escapeHtml(g.name) + '</span>';
        html += '<div class="companion-goal-row__bar"><div class="companion-goal-row__bar-fill" style="width:' + pct + '%"></div></div>';
        html += statusHTML;
        html += '</div>';
      }
    });
  } else if (partnerData) {
    html += '<div class="companion-goal-row"><span class="companion-goal-row__name" style="color:var(--text-3)">TA还没有共享的目标</span></div>';
  } else {
    html += '<div class="companion-goal-row"><span class="companion-goal-row__name" style="color:var(--text-3)">暂时无法获取TA的数据，可能是网络问题</span></div>';
  }
  html += '</div>';

  // 断卡打气
  if (partnerDaysSince >= 1) {
    html += '<div class="companion-cheer">';
    html += '<div class="companion-cheer__title">TA今天可能需要你</div>';
    var dayLabel = partnerDaysSince === 1 ? '一天' : (partnerDaysSince + '天');
    html += '<div class="companion-cheer__desc">TA已经' + dayLabel + '没打卡了。发一句打气的话吧——不用长篇大论，一句就行。</div>';
    html += '<div class="companion-cheer__options">';
    html += '<button class="companion-cheer__option" data-cheer="慢慢来，不着急。我在呢。" type="button">慢慢来，不着急。我在呢。</button>';
    html += '<button class="companion-cheer__option" data-cheer="今天可以只做一点点，做了就算。" type="button">今天可以只做一点点，做了就算。</button>';
    html += '<button class="companion-cheer__option" data-cheer="它还在等你。随时可以回来。" type="button">它还在等你。随时可以回来。</button>';
    html += '</div>';
    html += '</div>';
  }

  // 收到的打气占位
  html += '<div class="companion-cheers-received" id="cheers-received-area" hidden>';
  html += '<div class="companion-cheers-received__title">TA给你的打气</div>';
  html += '<div id="cheers-received-list"></div>';
  html += '</div>';

  // 共同目标区域
  html += '<div class="companion-shared-goals" id="companion-shared-goals-area"></div>';

  // 裁判模式区域
  html += '<div class="companion-judge" id="companion-judge-area"></div>';

  // 结束同行
  html += '<div class="companion-end">';
  html += '<button class="companion-end__btn" id="companion-end-btn" type="button">结束同行</button>';
  html += '</div>';

  container.innerHTML = html;

  // 渲染共同目标区域
  renderSharedGoalsSection();

  // 渲染裁判模式区域
  renderJudgeSection();

  // 绑定事件
  var shareBtn = container.querySelector('#companion-share-settings-btn');
  if (shareBtn) shareBtn.addEventListener('click', openShareSettings);

  var endBtn = container.querySelector('#companion-end-btn');
  if (endBtn) endBtn.addEventListener('click', function() {
    confirmDelete('结束同行？', '结束后双方不再共享进度。你们各自的历史会保留，只是看不见彼此了。共同目标会拆成各自的独立目标，谁的数据都不丢。', function() {
      if (!window.syncAdapter) return;
      // 先拆分共同目标
      splitSharedGoalsOnEnd();
      // 再结束同行
      syncAdapter.endSharedGoals().then(function() {
        return syncAdapter.endRoom();
      }).then(function() {
        showToast('这段同行结束了，各自的路继续走', 'success', { duration: 4000 });
        renderCompanion();
        updateCompanionStatusText();
      });
    });
    var okBtn = document.getElementById('confirm-ok');
    if (okBtn) okBtn.textContent = '结束';
  });

  // 打气按钮
  container.querySelectorAll('.companion-cheer__option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var msg = btn.dataset.cheer;
      syncAdapter.sendCheer(msg).then(function(ok) {
        if (ok) {
          showToast('打气已发送', 'success');
          btn.textContent = '已发送 ✓';
          btn.disabled = true;
          btn.style.opacity = '0.5';
        } else {
          showToast('发送失败，稍后再试', 'warning');
        }
      });
    });
  });
}

function renderReceivedCheers(cheers) {
  var realCheers = cheers.filter(function(c) { return c.message && c.message !== '__ENDED__'; });
  var endedMsg = cheers.find(function(c) { return c.message === '__ENDED__'; });

  if (endedMsg) {
    localStorage.removeItem(STORAGE_PARTNER);
    localStorage.removeItem(STORAGE_SHARE_SETTINGS);
    showToast('对方结束了同行。这段路一起走过的日子，各自保留', 'info', { duration: 5000 });
    renderCompanion();
    updateCompanionStatusText();
    return;
  }

  if (realCheers.length === 0) return;

  var area = document.getElementById('cheers-received-area');
  if (!area) return;
  area.hidden = false;

  var listEl = document.getElementById('cheers-received-list');
  var html = '';
  realCheers.forEach(function(c) {
    var d = new Date(c.createdAt);
    var timeStr = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    html += '<div class="companion-cheer-item">';
    html += '<div>' + escapeHtml(c.message) + '</div>';
    html += '<div class="companion-cheer-item__time">' + timeStr + '</div>';
    html += '</div>';
  });
  listEl.innerHTML = html;
}

// ---- 检查是否被对方结束同行 ----
function checkCompanionEnded() {
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) return;
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  syncAdapter.fetchCheers().then(function(cheers) {
    var endedMsg = cheers.find(function(c) { return c.message === '__ENDED__'; });
    if (endedMsg) {
      localStorage.removeItem(STORAGE_PARTNER);
      localStorage.removeItem(STORAGE_SHARE_SETTINGS);
      showToast('对方结束了同行。这段路一起走过的日子，各自保留', 'info', { duration: 5000 });
      updateCompanionStatusText();
    }
  });
}

// ---- 同行者事件绑定 ----
var _pollTimer = null;
var _waitingRoomId = null;

function initCompanion() {
  // 同行者入口卡
  var companionCard = document.querySelector('.card--companion');
  if (companionCard) {
    companionCard.addEventListener('click', function() { switchView('companion'); });
    companionCard.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchView('companion'); }
    });
  }

  // 连接弹窗
  var connectModal = document.getElementById('companion-connect-modal');
  if (connectModal) {
    connectModal.querySelectorAll('[data-close-companion-connect]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(connectModal); });
    });
    var createBtn = document.getElementById('companion-create-btn');
    if (createBtn) createBtn.addEventListener('click', createCompanionRoom);
    var joinBtn = document.getElementById('companion-join-btn');
    if (joinBtn) joinBtn.addEventListener('click', function() {
      closeAnyModal(connectModal);
      openModal(document.getElementById('companion-join-input-modal'));
    });
  }

  // 等待弹窗
  var waitingModal = document.getElementById('companion-waiting-modal');
  if (waitingModal) {
    waitingModal.querySelectorAll('[data-close-companion-waiting]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(waitingModal); stopPolling(); });
    });
    var cancelBtn = document.getElementById('companion-cancel-waiting');
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
      closeAnyModal(waitingModal); stopPolling();
    });
  }

  // 加入弹窗
  var joinModal = document.getElementById('companion-join-input-modal');
  if (joinModal) {
    joinModal.querySelectorAll('[data-close-companion-join]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(joinModal); });
    });
    var joinConfirm = document.getElementById('companion-join-confirm');
    if (joinConfirm) joinConfirm.addEventListener('click', joinCompanionRoom);
    var joinInput = document.getElementById('companion-join-code');
    if (joinInput) {
      joinInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') joinCompanionRoom();
      });
    }
  }

  // 共享设置弹窗
  var shareModal = document.getElementById('share-settings-modal');
  if (shareModal) {
    shareModal.querySelectorAll('[data-close-share-settings]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(shareModal); });
    });
    var shareConfirm = document.getElementById('share-settings-confirm');
    if (shareConfirm) shareConfirm.addEventListener('click', saveShareSettings);
  }

  // 打气弹窗
  var cheerModal = document.getElementById('cheer-modal');
  if (cheerModal) {
    cheerModal.querySelectorAll('[data-close-cheer]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(cheerModal); });
    });
  }

  // 共同目标创建弹窗
  var sharedCreateModal = document.getElementById('shared-goal-create-modal');
  if (sharedCreateModal) {
    sharedCreateModal.querySelectorAll('[data-close-shared-create]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(sharedCreateModal); });
    });
    var sharedCreateConfirm = document.getElementById('shared-goal-create-confirm');
    if (sharedCreateConfirm) sharedCreateConfirm.addEventListener('click', confirmSharedGoalCreate);
    var sharedTypeSelect = document.getElementById('shared-goal-type');
    if (sharedTypeSelect) {
      sharedTypeSelect.addEventListener('change', function() {
        var weeklyField = document.getElementById('field-shared-weekly');
        var lblTarget = document.getElementById('lbl-shared-target');
        if (weeklyField) weeklyField.hidden = sharedTypeSelect.value !== 'habit';
        if (lblTarget) lblTarget.textContent = sharedTypeSelect.value === 'habit' ? '目标总次数' : '目标值';
      });
    }
  }

  // 裁判弹窗
  var judgeModal = document.getElementById('judge-modal');
  if (judgeModal) {
    judgeModal.querySelectorAll('[data-close-judge]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(judgeModal); });
    });
  }

  // 驳回理由弹窗
  var judgeRejectModal = document.getElementById('judge-reject-modal');
  if (judgeRejectModal) {
    judgeRejectModal.querySelectorAll('[data-close-judge-reject]').forEach(function(el) {
      el.addEventListener('click', function() { closeAnyModal(judgeRejectModal); });
    });
    var judgeRejectConfirm = document.getElementById('judge-reject-confirm');
    if (judgeRejectConfirm) judgeRejectConfirm.addEventListener('click', confirmJudgeReject);
  }

  updateCompanionStatusText();
}

// ---- 创建暗号 ----
function createCompanionRoom() {
  var connectModal = document.getElementById('companion-connect-modal');
  closeAnyModal(connectModal);

  if (!window.syncAdapter || !syncAdapter.isReady()) {
    showToast('云端未连接，请稍后再试', 'warning');
    return;
  }

  var myName = getUserName() || '匿名';
  syncAdapter.createRoom(myName).then(function(res) {
    document.getElementById('companion-waiting-code').textContent = res.code;
    openModal(document.getElementById('companion-waiting-modal'));
    _waitingRoomId = res.roomId;
    startPolling(res.roomId);
  }).catch(function(e) {
    showToast('创建暗号失败：' + (e.message || e), 'warning');
  });
}

function startPolling(roomId) {
  stopPolling();
  _pollTimer = setInterval(function() {
    syncAdapter.pollRoomStatus(roomId).then(function(res) {
      if (res.matched) {
        stopPolling();
        var partner = {
          uid: res.partnerUid,
          name: res.partnerName || 'TA',
          roomId: roomId,
          connectedAt: todayKey()
        };
        saveJSON(STORAGE_PARTNER, partner);

        // 初始化默认共享设置（全部共享）
        var goals = loadGoals();
        var goalShares = {};
        goals.forEach(function(g) { if (!g.completed) goalShares[g.id] = true; });
        saveJSON(STORAGE_SHARE_SETTINGS, { goalShares: goalShares, showTodayStatus: true });

        closeAnyModal(document.getElementById('companion-waiting-modal'));
        syncToCloud();
        showToast('连接成功！你和「' + (res.partnerName || 'TA') + '」开始同行了', 'success', { duration: 4000 });
        openShareSettings();
        updateCompanionStatusText();
      } else if (res.ended) {
        stopPolling();
        closeAnyModal(document.getElementById('companion-waiting-modal'));
        showToast('暗号已失效，请重新创建', 'warning');
      }
    }).catch(function() {});
  }, 3000);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ---- 加入暗号 ----
function joinCompanionRoom() {
  var code = document.getElementById('companion-join-code').value.trim();
  var errorEl = document.getElementById('companion-join-error');

  if (!code || code.length !== 4) {
    errorEl.textContent = '请输入4个字的暗号';
    return;
  }
  errorEl.textContent = '';

  if (!window.syncAdapter || !syncAdapter.isReady()) {
    showToast('云端未连接，请稍后再试', 'warning');
    return;
  }

  var myName = getUserName() || '匿名';
  syncAdapter.joinRoom(code, myName).then(function(res) {
    var partner = {
      uid: res.partnerUid,
      name: res.partnerName || 'TA',
      roomId: res.roomId,
      connectedAt: todayKey()
    };
    saveJSON(STORAGE_PARTNER, partner);

    // 初始化默认共享设置
    var goals = loadGoals();
    var goalShares = {};
    goals.forEach(function(g) { if (!g.completed) goalShares[g.id] = true; });
    saveJSON(STORAGE_SHARE_SETTINGS, { goalShares: goalShares, showTodayStatus: true });

    closeAnyModal(document.getElementById('companion-join-input-modal'));
    syncToCloud();
    showToast('连接成功！你和「' + (res.partnerName || 'TA') + '」开始同行了', 'success', { duration: 4000 });
    openShareSettings();
    updateCompanionStatusText();
  }).catch(function(e) {
    errorEl.textContent = e.message || '连接失败';
  });
}

// ---- 共享设置 ----
function openShareSettings() {
  var modal = document.getElementById('share-settings-modal');
  var listEl = document.getElementById('share-settings-list');
  var settings = loadJSON(STORAGE_SHARE_SETTINGS, { goalShares: {}, showTodayStatus: true });
  var goals = loadGoals().filter(function(g) { return !g.completed; });

  var html = '';

  // 今日打卡状态总开关
  html += '<div class="share-settings__row share-settings__total-toggle">';
  html += '<span class="share-settings__row-name">今日打卡状态</span>';
  html += '<button class="toggle-switch ' + (settings.showTodayStatus !== false ? 'toggle-switch--on' : '') + '" data-toggle="showTodayStatus" type="button"></button>';
  html += '</div>';

  // 各目标独立开关
  goals.forEach(function(g) {
    var shared = settings.goalShares ? settings.goalShares[g.id] !== false : true;
    var typeLabel = { cumulative: '累计型', habit: '习惯型', milestone: '里程碑', value: '数值型', composite: '复合目标' }[g.type] || '';
    html += '<div class="share-settings__row">';
    html += '<span class="share-settings__row-name">' + escapeHtml(g.name) + '</span>';
    html += '<span class="share-settings__row-type">' + typeLabel + '</span>';
    html += '<button class="toggle-switch ' + (shared ? 'toggle-switch--on' : '') + '" data-toggle="goal" data-goal-id="' + g.id + '" type="button"></button>';
    html += '</div>';
  });

  if (goals.length === 0) {
    html += '<p style="font-size:13px;color:var(--text-3);padding:12px 0">还没有目标。去创建几个目标，同行者才能看见你的进度。</p>';
  }

  listEl.innerHTML = html;

  // 绑定 toggle
  listEl.querySelectorAll('.toggle-switch').forEach(function(toggle) {
    toggle.addEventListener('click', function() {
      toggle.classList.toggle('toggle-switch--on');
    });
  });

  openModal(modal);
}

function saveShareSettings() {
  var modal = document.getElementById('share-settings-modal');
  var settings = { goalShares: {}, showTodayStatus: true };

  var todayToggle = modal.querySelector('[data-toggle="showTodayStatus"]');
  if (todayToggle) settings.showTodayStatus = todayToggle.classList.contains('toggle-switch--on');

  modal.querySelectorAll('[data-toggle="goal"]').forEach(function(toggle) {
    settings.goalShares[toggle.dataset.goalId] = toggle.classList.contains('toggle-switch--on');
  });

  saveJSON(STORAGE_SHARE_SETTINGS, settings);
  closeAnyModal(modal);
  syncToCloud();
  showToast('共享设置已更新', 'success');

  if (document.querySelector('.view--active[data-view="companion"]')) {
    renderCompanion();
  }
}

// ============================================================
// 共同目标 + 裁判模式
// ============================================================

var STORAGE_SHARED_GOALS = 'lifeos_shared_goals';
var STORAGE_JUDGE_SETTINGS = 'lifeos_judge_settings';

// ---- 显示/隐藏「与同行者一起做」复选框 ----
function updateSharedGoalCheckboxVisibility(type) {
  var field = document.getElementById('field-shared-goal');
  if (!field) return;
  var partner = loadJSON(STORAGE_PARTNER, null);
  var hasPartner = !!(partner && partner.uid);
  var validType = (type === 'cumulative' || type === 'habit');
  field.hidden = !(hasPartner && validType);
}

// ============================================================
// 共同目标 — 渲染
// ============================================================

function renderSharedGoalsSection() {
  var area = document.getElementById('companion-shared-goals-area');
  if (!area) return;
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) { area.innerHTML = ''; return; }

  var html = '';
  html += '<div class="companion-shared-goals__title">';
  html += '共同目标';
  html += '<button class="companion-shared-goals__title-action" id="shared-goal-create-btn" type="button">发起共同目标</button>';
  html += '</div>';
  html += '<div id="shared-goals-list">正在加载…</div>';
  area.innerHTML = html;

  var createBtn = area.querySelector('#shared-goal-create-btn');
  if (createBtn) createBtn.addEventListener('click', openSharedGoalCreateModal);

  // 拉取云端数据
  if (window.syncAdapter && syncAdapter.isReady()) {
    // 先拉取邀请
    syncAdapter.fetchSharedGoalInvites().then(function(invites) {
      // 再拉取活跃的共同目标
      syncAdapter.fetchActiveSharedGoals().then(function(active) {
        renderSharedGoalsList(invites, active);
      });
    });
  } else {
    renderSharedGoalsList([], []);
  }
}

function renderSharedGoalsList(invites, activeGoals) {
  var listEl = document.getElementById('shared-goals-list');
  if (!listEl) return;
  var html = '';
  var myUid = syncAdapter.getUid();

  // 渲染邀请
  if (invites && invites.length > 0) {
    invites.forEach(function(inv) {
      html += '<div class="shared-goal-invite" data-invite-id="' + inv._id + '">';
      html += '<div class="shared-goal-invite__header">';
      html += '<span class="shared-goal-invite__icon">🤝</span>';
      html += '<span class="shared-goal-invite__title">' + escapeHtml(inv.creatorName || 'TA') + '邀请您一起：' + escapeHtml(inv.name) + '</span>';
      html += '</div>';
      var typeLabel = inv.type === 'habit' ? '习惯型' : '累计型';
      html += '<div class="shared-goal-invite__desc">' + typeLabel + ' · 目标 ' + inv.target + ' ' + escapeHtml(inv.unit || '个') + ' · 两人打卡加在一起算</div>';
      html += '<div class="shared-goal-invite__actions">';
      html += '<button class="shared-goal-invite__btn shared-goal-invite__btn--accept" data-accept-invite="' + inv._id + '" type="button">一起做</button>';
      html += '<button class="shared-goal-invite__btn shared-goal-invite__btn--reject" data-reject-invite="' + inv._id + '" type="button">不了，谢谢</button>';
      html += '</div>';
      html += '</div>';
    });
  }

  // 渲染活跃的共同目标
  if (activeGoals && activeGoals.length > 0) {
    activeGoals.forEach(function(sg) {
      var isCreator = sg.creatorUid === myUid;
      var myContribution = isCreator ? (sg.creatorContribution || 0) : (sg.partnerContribution || 0);
      var partnerContribution = isCreator ? (sg.partnerContribution || 0) : (sg.creatorContribution || 0);
      var total = myContribution + partnerContribution;
      var pct = sg.target > 0 ? Math.min(100, Math.round(total / sg.target * 100)) : 0;
      var myPct = total > 0 ? Math.round(myContribution / total * 100) : 50;
      var partnerPct = total > 0 ? 100 - myPct : 50;

      html += '<div class="shared-goal-card" data-shared-id="' + sg._id + '">';
      html += '<div class="shared-goal-card__header">';
      html += '<span class="shared-goal-card__icon">🎯</span>';
      html += '<span class="shared-goal-card__name">' + escapeHtml(sg.name) + '</span>';
      var statusLabel = sg.status === 'completed' ? '已完成' : (sg.status === 'pending' ? '等待接受' : '进行中');
      var statusClass = sg.status === 'completed' ? 'shared-goal-card__status--completed' : (sg.status === 'pending' ? 'shared-goal-card__status--pending' : 'shared-goal-card__status--active');
      html += '<span class="shared-goal-card__status ' + statusClass + '">' + statusLabel + '</span>';
      html += '</div>';

      // 合体进度大环
      var ringRadius = 34;
      var ringCircumference = 2 * Math.PI * ringRadius;
      var ringOffset = ringCircumference * (1 - pct / 100);
      html += '<div class="shared-goal-card__ring">';
      html += '<svg class="shared-goal-ring-svg" width="80" height="80" viewBox="0 0 80 80">';
      html += '<circle cx="40" cy="40" r="' + ringRadius + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>';
      html += '<circle cx="40" cy="40" r="' + ringRadius + '" fill="none" stroke="#4ade80" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + ringCircumference + '" stroke-dashoffset="' + ringOffset + '" transform="rotate(-90 40 40)"/>';
      html += '<text x="40" y="44" text-anchor="middle" fill="#e2e8f0" font-size="16" font-weight="700">' + pct + '%</text>';
      html += '</svg>';
      html += '<div class="shared-goal-ring-text">';
      html += '<span class="shared-goal-ring-text__pct">' + total + ' / ' + sg.target + ' ' + escapeHtml(sg.unit || '个') + '</span>';
      html += '<span class="shared-goal-ring-text__detail">两个人一起灌的水池</span>';
      html += '</div>';
      html += '</div>';

      // 两条个人小条
      html += '<div class="shared-goal-bars">';
      html += '<div class="shared-goal-bar-row">';
      html += '<span class="shared-goal-bar-row__label">我</span>';
      html += '<div class="shared-goal-bar-row__track"><div class="shared-goal-bar-row__fill shared-goal-bar-row__fill--me" style="width:' + myPct + '%"></div></div>';
      html += '<span class="shared-goal-bar-row__text">' + myContribution + ' · ' + myPct + '%</span>';
      html += '</div>';
      html += '<div class="shared-goal-bar-row">';
      var partnerName = (partner.name || 'TA');
      html += '<span class="shared-goal-bar-row__label">' + escapeHtml(partnerName) + '</span>';
      html += '<div class="shared-goal-bar-row__track"><div class="shared-goal-bar-row__fill shared-goal-bar-row__fill--partner" style="width:' + partnerPct + '%"></div></div>';
      html += '<span class="shared-goal-bar-row__text">' + partnerContribution + ' · ' + partnerPct + '%</span>';
      html += '</div>';
      html += '</div>';

      // 文案：贡献少的一方
      if (sg.status === 'active' && total > 0 && myContribution < partnerContribution) {
        html += '<div class="shared-goal-card__hint">TA多扛了一点，您明天补上？</div>';
      }

      // 打卡按钮（仅活跃状态）
      if (sg.status === 'active') {
        html += '<div class="shared-goal-card__actions">';
        var judgeSettings = loadJSON(STORAGE_JUDGE_SETTINGS, {});
        var btnLabel = judgeSettings.partnerJudgesMe ? '打卡（待认证）' : '打卡';
        html += '<button class="shared-goal-checkin-btn" data-shared-checkin="' + sg._id + '" type="button">' + btnLabel + '</button>';
        html += '</div>';
      }

      // 完成文案
      if (sg.status === 'completed') {
        html += '<div class="shared-goal-card__hint">我们一起做到的 ✓</div>';
      }

      html += '</div>';
    });
  }

  if (!html) {
    html = '<div style="font-size:12px;color:var(--t-3);padding:10px 0">还没有共同目标。点上面的「发起共同目标」试试？</div>';
  }

  listEl.innerHTML = html;

  // 绑定事件
  listEl.querySelectorAll('[data-accept-invite]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      acceptSharedGoalInvite(btn.dataset.acceptInvite);
    });
  });
  listEl.querySelectorAll('[data-reject-invite]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      rejectSharedGoalInvite(btn.dataset.rejectInvite);
    });
  });
  listEl.querySelectorAll('[data-shared-checkin]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openSharedGoalCheckin(btn.dataset.sharedCheckin);
    });
  });
}

// ============================================================
// 共同目标 — 从同行者页发起
// ============================================================

function openSharedGoalCreateModal() {
  var modal = document.getElementById('shared-goal-create-modal');
  if (!modal) return;
  var form = document.getElementById('shared-goal-form');
  if (form) form.reset();
  var weeklyField = document.getElementById('field-shared-weekly');
  if (weeklyField) weeklyField.hidden = true;
  openModal(modal);
}

function confirmSharedGoalCreate() {
  var form = document.getElementById('shared-goal-form');
  if (!form) return;
  var name = form.querySelector('[name="sharedName"]').value.trim();
  if (!name) { showToast('请填写目标名称', 'warning'); return; }
  var type = form.querySelector('[name="sharedType"]').value;
  var target = parseFloat(form.querySelector('[name="sharedTarget"]').value) || 100;
  var unit = form.querySelector('[name="sharedUnit"]').value.trim() || '个';
  var why = form.querySelector('[name="sharedWhy"]').value.trim();
  var weeklyTarget = type === 'habit' ? parseInt(form.querySelector('[name="sharedWeekly"]').value) || 3 : null;

  if (!window.syncAdapter || !syncAdapter.isReady()) {
    showToast('云端未连接', 'warning');
    return;
  }

  var btn = document.getElementById('shared-goal-create-confirm');
  if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }

  syncAdapter.createSharedGoal({
    creatorName: getUserName() || '匿名',
    name: name,
    type: type,
    target: target,
    unit: unit,
    why: why,
    weeklyTarget: weeklyTarget
  }).then(function(cloudId) {
    if (btn) { btn.disabled = false; btn.textContent = '发起邀请'; }
    if (cloudId) {
      // 本地记录
      var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
      sharedGoals.push({
        cloudId: cloudId,
        localGoalId: null,
        name: name,
        type: type,
        target: target,
        unit: unit,
        role: 'creator',
        status: 'pending',
        myContribution: 0,
        partnerContribution: 0,
        myCheckinDates: [],
        partnerCheckinDates: [],
        createdAt: Date.now()
      });
      saveJSON(STORAGE_SHARED_GOALS, sharedGoals);
      closeAnyModal(document.getElementById('shared-goal-create-modal'));
      showToast('邀请已发送，等TA接受', 'success', { duration: 4000 });
      renderSharedGoalsSection();
    } else {
      showToast('发送失败，稍后再试', 'warning');
    }
  });
}

// ============================================================
// 共同目标 — 接受/拒绝邀请
// ============================================================

function acceptSharedGoalInvite(inviteId) {
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  syncAdapter.acceptSharedGoal(inviteId).then(function(ok) {
    if (ok) {
      // 在本地创建一个对应的个人目标（用于本地打卡）
      // 先获取邀请详情
      syncAdapter.fetchSharedGoalInvites().then(function(invites) {
        var inv = invites.find(function(i) { return i._id === inviteId; });
        if (inv) {
          var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
          sharedGoals.push({
            cloudId: inv._id,
            localGoalId: null,
            name: inv.name,
            type: inv.type,
            target: inv.target,
            unit: inv.unit,
            role: 'partner',
            status: 'active',
            myContribution: 0,
            partnerContribution: 0,
            myCheckinDates: [],
            partnerCheckinDates: [],
            createdAt: Date.now()
          });
          saveJSON(STORAGE_SHARED_GOALS, sharedGoals);
        }
        showToast('一起做吧！', 'success', { duration: 3000 });
        renderSharedGoalsSection();
      });
    } else {
      showToast('接受失败，稍后再试', 'warning');
    }
  });
}

function rejectSharedGoalInvite(inviteId) {
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  syncAdapter.rejectSharedGoal(inviteId).then(function(ok) {
    if (ok) {
      showToast('已拒绝。TA会收到一句「TA暂时不想接这个，没关系」', 'info', { duration: 4000 });
      renderSharedGoalsSection();
    } else {
      showToast('操作失败，稍后再试', 'warning');
    }
  });
}

// ============================================================
// 共同目标 — 打卡（共享水池）
// ============================================================

function openSharedGoalCheckin(sharedGoalId) {
  // 简单 prompt 方式 — 习惯型默认+1，累计型需输入量
  var activeGoals = null;
  // 从 DOM 获取当前目标信息
  var card = document.querySelector('[data-shared-id="' + sharedGoalId + '"]');
  if (!card) return;
  var nameEl = card.querySelector('.shared-goal-card__name');
  var goalName = nameEl ? nameEl.textContent : '共同目标';

  // 判断类型：从本地记录或DOM推断
  var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
  var localRec = sharedGoals.find(function(sg) { return sg.cloudId === sharedGoalId; });
  var isHabit = localRec ? (localRec.type === 'habit') : false;

  var amount = 1;
  if (!isHabit) {
    var input = prompt('打卡：' + goalName + '\n输入本次量（数字）：', '1');
    if (input === null) return;
    amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      showToast('请输入大于0的数字', 'warning');
      return;
    }
  }

  doSharedGoalCheckin(sharedGoalId, amount, goalName);
}

function doSharedGoalCheckin(sharedGoalId, amount, goalName) {
  var today = todayKey();
  var partner = loadJSON(STORAGE_PARTNER, null);
  var judgeSettings = loadJSON(STORAGE_JUDGE_SETTINGS, {});

  // 如果裁判模式开启，先推送待认证
  if (judgeSettings.partnerJudgesMe && partner && partner.uid && window.syncAdapter && syncAdapter.isReady()) {
    syncAdapter.pushPendingCheckin({
      fromName: getUserName() || '匿名',
      goalId: sharedGoalId,
      goalName: goalName,
      amount: amount,
      date: today,
      note: '',
      tag: 'shared'
    }).then(function(id) {
      if (id) {
        showToast('已提交，等TA认证后计入水池', 'info', { duration: 3000 });
      } else {
        showToast('提交失败，稍后再试', 'warning');
      }
    });
    return;
  }

  // 正常流程：直接推送到共享水池
  if (!window.syncAdapter || !syncAdapter.isReady()) {
    showToast('云端未连接，打卡未记录', 'warning');
    return;
  }

  syncAdapter.pushSharedProgress(sharedGoalId, amount, today).then(function(ok) {
    if (ok) {
      // 更新本地记录
      var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
      var sg = sharedGoals.find(function(s) { return s.cloudId === sharedGoalId; });
      if (sg) {
        sg.myContribution = (sg.myContribution || 0) + amount;
        if (sg.myCheckinDates.indexOf(today) === -1) sg.myCheckinDates.push(today);
        saveJSON(STORAGE_SHARED_GOALS, sharedGoals);
      }
      showToast('+' + amount + ' 已灌入水池', 'success');
      // 检查完成 + 重新渲染
      checkSharedGoalCompletion(sharedGoalId);
      renderSharedGoalsSection();
    } else {
      showToast('打卡失败，稍后再试', 'warning');
    }
  });
}

// ============================================================
// 共同目标 — 完成检测 + 撒花
// ============================================================

function checkSharedGoalCompletion(sharedGoalId) {
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  syncAdapter.fetchActiveSharedGoals().then(function(goals) {
    var sg = goals.find(function(g) { return g._id === sharedGoalId; });
    if (!sg) return;
    if (sg.status === 'completed' && sg.completedAt) {
      // 检查是否已经庆祝过
      var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
      var local = sharedGoals.find(function(s) { return s.cloudId === sharedGoalId; });
      if (local && !local.celebrated) {
        local.celebrated = true;
        local.status = 'completed';
        saveJSON(STORAGE_SHARED_GOALS, sharedGoals);
        // 撒花（双方各自触发）
        launchConfetti();
        setTimeout(function() { launchConfetti(); }, 500);
        var ritualHTML =
          '<div class="completion-ritual" id="completion-ritual-shared">' +
            '<div class="completion-ritual__inner">' +
              '<div class="completion-ritual__icon">🏆</div>' +
              '<h2 class="completion-ritual__title">' + escapeHtml(sg.name) + '</h2>' +
              '<p class="completion-ritual__text">我们一起做到的</p>' +
            '</div>' +
          '</div>';
        var div = document.createElement('div');
        div.innerHTML = ritualHTML;
        document.body.appendChild(div.firstElementChild);
        setTimeout(function() {
          var r = document.getElementById('completion-ritual-shared');
          if (r) { r.classList.add('completion-ritual--fadeout'); setTimeout(function() { if (r) r.remove(); }, 800); }
        }, 3000);
        showToast('我们一起做到的！「' + sg.name + '」', 'success', { duration: 5000 });
      }
    }
  });
}

// ============================================================
// 共同目标 — 结束同行时拆分
// ============================================================

function splitSharedGoalsOnEnd() {
  var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
  var activeShared = sharedGoals.filter(function(sg) { return sg.status === 'active' || sg.status === 'pending'; });
  if (activeShared.length === 0) return;

  var goals = loadGoals();
  var partner = loadJSON(STORAGE_PARTNER, null);
  var partnerName = partner ? (partner.name || 'TA') : 'TA';

  activeShared.forEach(function(sg) {
    // 创建一个独立的个人目标，带上自己的贡献量
    var newGoal = {
      id: uuid(),
      name: sg.name,
      why: sg.why || '',
      type: sg.type,
      target: sg.target,
      unit: sg.unit,
      deadline: null,
      weeklyTarget: sg.type === 'habit' ? (sg.weeklyTarget || 3) : null,
      currentValue: sg.myContribution || 0,
      checkins: [],
      completed: false,
      completedDate: null,
      createdDate: new Date().toISOString(),
      paused: false,
      quickButtons: null,
      fields: null,
      monthlyDeposit: null,
      _reached50: false,
      _completedNotified: false,
      _splitFromShared: true,
      _sharedPartnerName: partnerName
    };
    goals.push(newGoal);
  });

  saveGoals(goals);
  // 清除本地共同目标记录
  saveJSON(STORAGE_SHARED_GOALS, []);
  renderGoals();
}

// ============================================================
// 裁判模式
// ============================================================

function renderJudgeSection() {
  var area = document.getElementById('companion-judge-area');
  if (!area) return;
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) { area.innerHTML = ''; return; }

  var settings = loadJSON(STORAGE_JUDGE_SETTINGS, {});
  var html = '';
  html += '<div class="judge-toggle-row">';
  html += '<div class="judge-toggle-row__text">';
  html += '<span class="judge-toggle-row__label">请TA当我的裁判</span>';
  html += '<span class="judge-toggle-row__hint">开启后，你的打卡需对方认证才计入进度。48小时没处理自动算认证。</span>';
  html += '</div>';
  if (settings.partnerJudgesMe) {
    html += '<span class="judge-toggle-row__badge">已开启</span>';
  }
  html += '<label style="display:flex;align-items:center;cursor:pointer">';
  var checked = settings.partnerJudgesMe ? 'checked' : '';
  html += '<input type="checkbox" id="judge-toggle-checkbox" ' + checked + ' style="width:18px;height:18px;accent-color:#fbbf24">';
  html += '</label>';
  html += '</div>';

  // 待认证入口（对方让我当裁判时）
  html += '<div id="judge-pending-area" style="margin-top:8px"></div>';

  area.innerHTML = html;

  var toggle = area.querySelector('#judge-toggle-checkbox');
  if (toggle) {
    toggle.addEventListener('change', function() {
      var s = loadJSON(STORAGE_JUDGE_SETTINGS, {});
      s.partnerJudgesMe = toggle.checked;
      saveJSON(STORAGE_JUDGE_SETTINGS, s);
      if (toggle.checked) {
        showToast('已开启裁判模式。你的打卡将先发给TA认证', 'info', { duration: 4000 });
      } else {
        showToast('已关闭裁判模式。打卡直接计入进度', 'info');
      }
      renderJudgeSection();
    });
  }

  // 拉取待认证打卡（对方让我当裁判的）
  if (window.syncAdapter && syncAdapter.isReady()) {
    // 先自动认证超时的
    syncAdapter.autoApproveExpired().then(function() {
      syncAdapter.fetchPendingCheckins().then(function(pending) {
        renderJudgePendingEntry(pending.length);
      });
      // 同时拉取自己被驳回/已认证的打卡
      pollJudgeResults();
    });
  }
}

function renderJudgePendingEntry(count) {
  var area = document.getElementById('judge-pending-area');
  if (!area) return;
  if (count === 0) {
    area.innerHTML = '';
    return;
  }
  var html = '<button class="btn btn--ghost btn--small" id="judge-open-modal-btn" type="button" style="width:100%;justify-content:center;border-color:rgba(251,191,36,0.3)">';
  html += 'TA有 ' + count + ' 条打卡等你认证';
  html += '</button>';
  area.innerHTML = html;
  var btn = area.querySelector('#judge-open-modal-btn');
  if (btn) btn.addEventListener('click', openJudgeModal);
}

function openJudgeModal() {
  var modal = document.getElementById('judge-modal');
  if (!modal) return;
  openModal(modal);
  renderJudgeList();
}

function renderJudgeList() {
  var listEl = document.getElementById('judge-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="judge-empty">加载中…</div>';

  if (!window.syncAdapter || !syncAdapter.isReady()) {
    listEl.innerHTML = '<div class="judge-empty">云端未连接</div>';
    return;
  }

  syncAdapter.fetchPendingCheckins().then(function(pending) {
    if (pending.length === 0) {
      listEl.innerHTML = '<div class="judge-empty">没有待认证的打卡，TA做的都认了 ✓</div>';
      return;
    }

    var html = '';
    pending.forEach(function(c) {
      var d = new Date(c.createdAt);
      var timeStr = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      // 48小时倒计时
      var elapsed = Date.now() - (c.createdAt || 0);
      var remaining = 48 * 60 * 60 * 1000 - elapsed;
      var remainingStr = '';
      if (remaining > 0) {
        var hours = Math.floor(remaining / (60 * 60 * 1000));
        remainingStr = hours + '小时后自动认证';
      } else {
        remainingStr = '即将自动认证';
      }

      html += '<div class="judge-item" data-checkin-id="' + c._id + '">';
      html += '<div class="judge-item__header">';
      html += '<span class="judge-item__name">' + escapeHtml(c.goalName || '打卡') + '</span>';
      html += '<span class="judge-item__amount">+' + c.amount + '</span>';
      html += '</div>';
      html += '<div class="judge-item__meta">' + escapeHtml(c.fromName || 'TA') + ' · ' + timeStr + ' · ' + remainingStr + '</div>';
      if (c.note) {
        html += '<div class="judge-item__note">' + escapeHtml(c.note) + '</div>';
      }
      html += '<div class="judge-item__actions">';
      html += '<button class="judge-item__btn judge-item__btn--approve" data-approve-checkin="' + c._id + '" type="button">认证</button>';
      html += '<button class="judge-item__btn judge-item__btn--reject" data-reject-checkin="' + c._id + '" type="button">驳回</button>';
      html += '</div>';
      html += '</div>';
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-approve-checkin]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        approvePendingCheckin(btn.dataset.approveCheckin);
      });
    });
    listEl.querySelectorAll('[data-reject-checkin]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openJudgeRejectModal(btn.dataset.rejectCheckin);
      });
    });
  });
}

function approvePendingCheckin(checkinId) {
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  syncAdapter.approveCheckin(checkinId).then(function(ok) {
    if (ok) {
      showToast('已认证', 'success');
      renderJudgeList();
      renderJudgeSection();
    } else {
      showToast('操作失败', 'warning');
    }
  });
}

var _rejectCheckinId = null;

function openJudgeRejectModal(checkinId) {
  _rejectCheckinId = checkinId;
  var modal = document.getElementById('judge-reject-modal');
  if (!modal) return;
  var reasonEl = document.getElementById('judge-reject-reason');
  if (reasonEl) reasonEl.value = '';
  var errorEl = document.getElementById('judge-reject-error');
  if (errorEl) errorEl.textContent = '';
  openModal(modal);
}

function confirmJudgeReject() {
  var reasonEl = document.getElementById('judge-reject-reason');
  var errorEl = document.getElementById('judge-reject-error');
  if (!reasonEl || !_rejectCheckinId) return;
  var reason = reasonEl.value.trim();
  if (!reason) {
    if (errorEl) errorEl.textContent = '请填一句话理由，空驳回不行';
    return;
  }
  if (errorEl) errorEl.textContent = '';

  if (!window.syncAdapter || !syncAdapter.isReady()) return;

  syncAdapter.rejectCheckin(_rejectCheckinId, reason).then(function(ok) {
    if (ok) {
      closeAnyModal(document.getElementById('judge-reject-modal'));
      showToast('已驳回，TA会看到你的理由', 'info');
      renderJudgeList();
      renderJudgeSection();
    } else {
      if (errorEl) errorEl.textContent = '操作失败，稍后再试';
    }
  });
}

// ============================================================
// 裁判模式 — 拉取自己的认证结果
// ============================================================

function pollJudgeResults() {
  if (!window.syncAdapter || !syncAdapter.isReady()) return;
  var partner = loadJSON(STORAGE_PARTNER, null);
  if (!partner || !partner.uid) return;

  var settings = loadJSON(STORAGE_JUDGE_SETTINGS, {});
  if (!settings.partnerJudgesMe) return;

  // 拉取已认证的 → 应用到进度
  syncAdapter.fetchApprovedCheckins().then(function(approved) {
    if (approved.length === 0) return;
    var applied = loadJSON('lifeos_judge_applied', []);
    var toApply = approved.filter(function(c) { return applied.indexOf(c._id) === -1; });

    if (toApply.length > 0) {
      var sharedGoals = loadJSON(STORAGE_SHARED_GOALS, []);
      toApply.forEach(function(c) {
        // 如果是共同目标的打卡
        var sharedGoal = sharedGoals.find(function(sg) { return sg.cloudId === c.goalId; });
        if (sharedGoal && window.syncAdapter) {
          // 推送到共享水池
          syncAdapter.pushSharedProgress(c.goalId, c.amount, c.date).then(function() {
            sharedGoal.myContribution = (sharedGoal.myContribution || 0) + c.amount;
            if (sharedGoal.myCheckinDates.indexOf(c.date) === -1) sharedGoal.myCheckinDates.push(c.date);
            saveJSON(STORAGE_SHARED_GOALS, sharedGoals);
            checkSharedGoalCompletion(c.goalId);
          });
        }
        applied.push(c._id);
      });
      saveJSON('lifeos_judge_applied', applied);
      if (document.querySelector('.view--active[data-view="companion"]')) {
        renderSharedGoalsSection();
      }
    }

    // 清理已拉取的已认证记录
    syncAdapter.clearProcessedCheckins();
  });

  // 拉取被驳回的 → 显示提示
  syncAdapter.fetchRejectedCheckins().then(function(rejected) {
    if (rejected.length === 0) return;
    var shown = loadJSON('lifeos_judge_shown_rejections', []);
    var newRejections = rejected.filter(function(c) { return shown.indexOf(c._id) === -1; });

    if (newRejections.length > 0) {
      var r = newRejections[0];
      showToast('TA这次没认「' + (r.goalName || '打卡') + '」，聊聊？还是您记错了？', 'warning', { duration: 6000 });
      newRejections.forEach(function(c) { shown.push(c._id); });
      saveJSON('lifeos_judge_shown_rejections', shown);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================
// Sprint 4：存款板块 · 记账→时间线 · 睡眠趋势 · 周期卡 · 卡片排序
// ============================================================

// ---- 存款：数据层 ----
var STORAGE_FINANCE = 'lifeos_finance';
var STORAGE_FINANCE_LOCK = 'lifeos_finance_lock';
var SESSION_FIN_UNLOCKED = 'lifeos_finance_unlocked';

function loadFinance() { return loadJSON(STORAGE_FINANCE, []); }
function saveFinance(arr) { saveJSON(STORAGE_FINANCE, arr); }
function loadFinanceLock() { return loadJSON(STORAGE_FINANCE_LOCK, null) || {}; }
function saveFinanceLock(obj) { saveJSON(STORAGE_FINANCE_LOCK, obj); }

// 看板可见 = 本会话已解锁。没设过 PIN 时第一次解锁就是「设 PIN」流程
function isFinanceVisible() {
  try { return sessionStorage.getItem(SESSION_FIN_UNLOCKED) === '1'; } catch(e) { return false; }
}
function markFinanceUnlocked() {
  try { sessionStorage.setItem(SESSION_FIN_UNLOCKED, '1'); } catch(e) {}
}
function lockFinance() {
  try { sessionStorage.removeItem(SESSION_FIN_UNLOCKED); } catch(e) {}
}

// ---- 存款：渲染 ----
function renderFinancePanel() {
  var slide = document.getElementById('fin-slide-main');
  if (!slide) return;
  var relockBtn = document.getElementById('fin-relock-btn');
  var visible = isFinanceVisible();
  if (relockBtn) relockBtn.hidden = !visible;

  if (!visible) {
    slide.innerHTML = '<div class="fin-lock">'
      + '<div class="fin-lock__icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>'
      + '</div>'
      + '<p class="fin-lock__text">钱的事，默认上锁</p>'
      + '<button type="button" class="btn btn--primary btn--small" data-fin-unlock>输 PIN 看余额</button>'
      + '</div>';
    return;
  }

  var recs = loadFinance();
  var today = todayKey();
  var monthKey = today.slice(0, 7);
  var balance = 0, monthIn = 0, monthOut = 0;
  var catMap = {};
  recs.forEach(function(r) {
    var amt = parseFloat(r.amount) || 0;
    if (r.type === 'income') { balance += amt; if (r.date.slice(0,7) === monthKey) monthIn += amt; }
    else { balance -= amt; if (r.date.slice(0,7) === monthKey) { monthOut += amt; if (r.category) catMap[r.category] = (catMap[r.category] || 0) + amt; } }
  });

  // 本月支出分类排行（条形，前5）
  var cats = Object.keys(catMap).map(function(k) { return { name: k, amt: catMap[k] }; })
    .sort(function(a, b) { return b.amt - a.amt; }).slice(0, 5);
  var catHtml = '';
  if (cats.length === 0) {
    catHtml = '<p class="fin-cats__empty muted-tiny">这个月还没花过钱，或者还没记</p>';
  } else {
    var catMax = cats[0].amt || 1;
    catHtml = '<div class="fin-cats">' + cats.map(function(c) {
      return '<div class="fin-cat-row">'
        + '<span class="fin-cat-row__name">' + escapeHtml(c.name) + '</span>'
        + '<span class="fin-cat-row__bar"><span class="fin-cat-row__fill" style="width:' + Math.max(4, Math.round(c.amt * 100 / catMax)) + '%"></span></span>'
        + '<span class="fin-cat-row__amt">¥' + c.amt.toFixed(2) + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  // 今日账目
  var todayRecs = recs.filter(function(r) { return r.date === today; }).slice(-4).reverse();
  var todayHtml = '';
  if (todayRecs.length > 0) {
    todayHtml = '<div class="fin-today"><p class="fin-today__title">今天</p>'
      + todayRecs.map(function(r) {
          return '<div class="fin-today__row">'
            + '<span class="fin-today__cat">' + (r.type === 'income' ? '收' : '支') + ' · ' + escapeHtml(r.category) + '</span>'
            + '<span class="fin-today__amt fin-today__amt--' + r.type + '">' + (r.type === 'income' ? '+' : '-') + '¥' + (parseFloat(r.amount) || 0).toFixed(2) + '</span>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  slide.innerHTML = '<div class="fin-board">'
    + '<div class="fin-balance"><span class="fin-balance__label">余额</span>'
    + '<span class="fin-balance__num">¥' + balance.toFixed(2) + '</span></div>'
    + '<div class="fin-month"><span class="fin-month__in">本月收 +¥' + monthIn.toFixed(2) + '</span>'
    + '<span class="fin-month__out">本月支 -¥' + monthOut.toFixed(2) + '</span></div>'
    + '<p class="fin-cats__title">本月花在哪</p>'
    + catHtml
    + todayHtml
    + '</div>';
}

// ---- 存款：解锁弹窗（首次=设 PIN，之后=解锁） ----
var _finPinBuf = '';
var _finMode = 'unlock'; // 'set1' | 'set2' | 'unlock'
var _finFirstPin = '';

function openFinUnlockModal() {
  var modal = document.getElementById('fin-unlock-modal');
  if (!modal) return;
  _finPinBuf = '';
  _finFirstPin = '';
  var hasPin = !!loadFinanceLock().pinHash;
  _finMode = hasPin ? 'unlock' : 'set1';
  document.getElementById('fin-unlock-title').textContent = hasPin ? '解锁存款看板' : '给存款看板设个 PIN';
  document.getElementById('fin-unlock-hint').textContent = hasPin
    ? '这个看板默认上锁。输 4 位 PIN 看余额和账目。'
    : '第一次来。想一个 4 位 PIN，以后看余额都先输它。';
  document.getElementById('fin-unlock-error').textContent = '';
  paintFinPinDisplay();
  openModal(modal);
}

function paintFinPinDisplay() {
  var dots = document.querySelectorAll('#fin-unlock-display .pin-dot');
  dots.forEach(function(dot, i) {
    if (i < _finPinBuf.length) dot.classList.add('pin-dot--filled');
    else dot.classList.remove('pin-dot--filled');
  });
}

function pushFinPinDigit(d) {
  if (_finPinBuf.length >= 4) return;
  if (!/^[0-9]$/.test(d)) return;
  _finPinBuf += d;
  paintFinPinDisplay();
  document.getElementById('fin-unlock-error').textContent = '';
  if (_finPinBuf.length === 4) {
    var lock = loadFinanceLock();
    if (_finMode === 'unlock') {
      if (verifyPin(_finPinBuf, lock.pinHash)) {
        markFinanceUnlocked();
        document.getElementById('fin-unlock-modal').hidden = true;
        renderFinancePanel();
        showToast('解锁了', 'success');
      } else {
        finPinError('不对，再试一次');
      }
    } else if (_finMode === 'set1') {
      _finFirstPin = _finPinBuf;
      _finMode = 'set2';
      document.getElementById('fin-unlock-hint').textContent = '好。再输一次确认，两次一样才算数。';
      setTimeout(function() { _finPinBuf = ''; paintFinPinDisplay(); }, 250);
    } else if (_finMode === 'set2') {
      if (_finPinBuf === _finFirstPin) {
        saveFinanceLock({ pinHash: simpleHashPin(_finPinBuf), setAt: new Date().toISOString() });
        markFinanceUnlocked();
        document.getElementById('fin-unlock-modal').hidden = true;
        renderFinancePanel();
        showToast('PIN 设好了，看板开了', 'success');
      } else {
        _finMode = 'set1';
        _finFirstPin = '';
        document.getElementById('fin-unlock-hint').textContent = '两次不一样。重新想一个 4 位 PIN。';
        finPinError('两次输入不一致');
      }
    }
  }
}

function finPinError(msg) {
  var errEl = document.getElementById('fin-unlock-error');
  errEl.textContent = msg;
  errEl.classList.add('field__error--shake');
  setTimeout(function() { errEl.classList.remove('field__error--shake'); }, 600);
  setTimeout(function() { _finPinBuf = ''; paintFinPinDisplay(); }, 600);
}

function popFinPinDigit() {
  if (_finPinBuf.length === 0) return;
  _finPinBuf = _finPinBuf.slice(0, -1);
  paintFinPinDisplay();
  document.getElementById('fin-unlock-error').textContent = '';
}

// ---- 存款：记一笔 ----
function openFinanceModal() {
  var modal = document.getElementById('finance-modal');
  if (!modal) return;
  document.getElementById('fin-amount').value = '';
  document.getElementById('fin-note').value = '';
  document.getElementById('fin-amount-error').textContent = '';
  setFinType('expense');
  document.getElementById('fin-timeline-field').hidden = true;
  document.getElementById('fin-timeline').checked = true;
  openModal(modal);
  setTimeout(function() { document.getElementById('fin-amount').focus(); }, 200);
}

function setFinType(t) {
  document.getElementById('fin-type').value = t;
  document.querySelectorAll('.fin-type-toggle__btn').forEach(function(b) {
    b.classList.toggle('is-active', b.dataset.finType === t);
  });
  document.getElementById('fin-cat-chips').hidden = (t !== 'expense');
  document.getElementById('fin-cat-chips-income').hidden = (t !== 'income');
  // 分类重置为该组第一个
  var group = t === 'expense' ? document.getElementById('fin-cat-chips') : document.getElementById('fin-cat-chips-income');
  var first = group ? group.querySelector('.fin-chip') : null;
  if (first) setFinCategory(first.dataset.cat);
  document.getElementById('fin-timeline-field').hidden = true;
}

function setFinCategory(cat) {
  document.getElementById('fin-category').value = cat;
  document.querySelectorAll('.fin-chip').forEach(function(c) {
    c.classList.toggle('is-active', c.dataset.cat === cat);
  });
}

// 大额支出（≥300）自动浮现「记进时间线」
var FIN_TIMELINE_THRESHOLD = 300;

function updateFinTimelineField() {
  var t = document.getElementById('fin-type').value;
  var amt = parseFloat(document.getElementById('fin-amount').value);
  var field = document.getElementById('fin-timeline-field');
  if (!field) return;
  field.hidden = !(t === 'expense' && !isNaN(amt) && amt >= FIN_TIMELINE_THRESHOLD);
}

function submitFinanceEntry(e) {
  if (e) e.preventDefault();
  var raw = (document.getElementById('fin-amount').value || '').trim();
  var amtEl = document.getElementById('fin-amount');
  var errEl = document.getElementById('fin-amount-error');
  var amount = parseFloat(raw);
  if (!raw || isNaN(amount) || amount <= 0) {
    errEl.textContent = '金额得是大于 0 的数';
    amtEl.classList.add('field__input--error');
    setTimeout(function() { amtEl.classList.remove('field__input--error'); }, 1200);
    return;
  }
  var type = document.getElementById('fin-type').value || 'expense';
  var category = document.getElementById('fin-category').value || '其他';
  var note = (document.getElementById('fin-note').value || '').trim();
  var now = new Date();
  var recs = loadFinance();
  recs.push({
    id: uuid(),
    date: todayKey(),
    time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    type: type,
    category: category,
    amount: Math.round(amount * 100) / 100,
    note: note
  });
  saveFinance(recs);

  // 联动：勾了「记进时间线」→ 写一条 auto 节点进既往也咎
  var wentTimeline = false;
  var tlField = document.getElementById('fin-timeline-field');
  var tlChecked = document.getElementById('fin-timeline') && document.getElementById('fin-timeline').checked;
  if (!tlField.hidden && tlChecked) {
    var timeline = loadJSON(STORAGE_TIMELINE, []);
    timeline.push({
      id: uuid(),
      date: todayKey(),
      title: (type === 'income' ? '收了一笔 ' : '花了一笔 ') + '¥' + amount.toFixed(2) + ' · ' + category,
      mood: 'auto',
      desc: note || (type === 'income' ? '💰 这笔进了时间线，因为它不小' : '💰 这笔进了时间线，因为它不小'),
      auto: true
    });
    saveJSON(STORAGE_TIMELINE, timeline);
    wentTimeline = true;
  }

  document.getElementById('finance-modal').hidden = true;
  renderFinancePanel();
  showToast('记下了' + (wentTimeline ? '，时间线里也有它' : ''), 'success');
}

// ---- 睡眠趋势：近 7 天时长曲线（原生 SVG） ----
function renderSleepTrend() {
  var el = document.getElementById('sleep-trend-chart');
  if (!el) return;
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      label: (d.getMonth() + 1) + '/' + d.getDate()
    });
  }
  var recs = loadSleep();
  var vals = days.map(function(day) {
    var r = recs.find(function(x) { return x.date === day.key; });
    if (!r) return null;
    var b = parseHM(r.bedtime), w = parseHM(r.waketime);
    if (b == null || w == null) return null;
    return w >= b ? (w - b) : (24 * 60 - b + w);
  });
  var has = vals.filter(function(v) { return v != null; });
  if (has.length < 2) {
    el.innerHTML = '<p class="sleep-trend__hint muted-tiny">多记几晚，这里会长出近 7 天的睡眠曲线</p>';
    return;
  }
  var w = 280, h = 72, padX = 14, padTop = 8, padBottom = 18;
  var vMax = Math.max.apply(null, has.concat([8 * 60])); // 按 8 小时兜底，曲线不虚高
  var xStep = (w - 2 * padX) / 6;
  var yOf = function(v) { return padTop + (1 - v / vMax) * (h - padTop - padBottom); };
  var pts = vals.map(function(v, i) {
    var x = padX + i * xStep;
    return (v == null) ? null : { x: x, y: yOf(v), v: v, label: days[i].label };
  });
  var drawn = pts.filter(function(p) { return p != null; });
  var poly = drawn.map(function(p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  // 8 小时参考线
  var refY = yOf(8 * 60);
  var dots = drawn.map(function(p) {
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.4" fill="currentColor"/>'
      + '<text x="' + p.x.toFixed(1) + '" y="' + (h - 4) + '" text-anchor="middle" class="sleep-trend__label">' + p.label + '</text>'
      + '<title>' + p.label + ' · ' + fmtDuration(p.v) + '</title>';
  }).join('');
  el.innerHTML = '<p class="sleep-trend__title">近 7 天 · ' + fmtDuration(Math.round(has.reduce(function(a, b) { return a + b; }, 0) / has.length)) + ' 一晚（均值）</p>'
    + '<svg viewBox="0 0 ' + w + ' ' + h + '" class="sleep-trend__svg" preserveAspectRatio="xMidYMid meet">'
    + '<line x1="' + padX + '" y1="' + refY.toFixed(1) + '" x2="' + (w - padX) + '" y2="' + refY.toFixed(1) + '" stroke="currentColor" stroke-width="0.6" stroke-dasharray="3 3" opacity="0.35"/>'
    + '<text x="' + (w - padX) + '" y="' + (refY - 3).toFixed(1) + '" text-anchor="end" class="sleep-trend__ref">8h</text>'
    + '<polyline points="' + poly + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    + dots
    + '</svg>';
}

// ---- 周期卡：记开始日 + 算规律 ----
function openCycleModal(cardId) {
  var card = loadCustomCards().find(function(c) { return c.id === cardId; });
  if (!card) return;
  var modal = document.getElementById('cycle-modal');
  if (!modal) return;
  document.getElementById('cycle-card-id').value = cardId;
  document.getElementById('cycle-title').textContent = '「' + card.name + '」记开始日';
  var d = new Date();
  document.getElementById('cycle-date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  openModal(modal);
}

function submitCycleStart(e) {
  if (e) e.preventDefault();
  var cardId = document.getElementById('cycle-card-id').value;
  var date = document.getElementById('cycle-date').value;
  if (!cardId || !date) return;
  // 同一天已经记过就不再重复记
  var exists = loadCustomEntries().some(function(en) {
    return en.cardId === cardId && en.kind === 'cycle' && en.date === date;
  });
  if (!exists) {
    var entries = loadCustomEntries();
    entries.push({
      id: uuid(),
      cardId: cardId,
      date: date,
      time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
      valueNum: null,
      text: '',
      kind: 'cycle'
    });
    saveCustomEntries(entries);
  }
  document.getElementById('cycle-modal').hidden = true;
  renderCustomPanel();
  showToast(exists ? '这天已经记过了' : '开始日记下了，规律会自己算', 'success');
}

// 周期推算：平均周期（21-45 截断）、当前状态、下次预测
function computeCycleInfo(starts) {
  var PERIOD_DAYS = 5;
  function parseD(s) {
    var p = s.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  var last = parseD(starts[starts.length - 1]);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var daysSince = Math.round((today - last) / 86400000);
  var avg = null;
  if (starts.length >= 2) {
    var gaps = [];
    for (var i = 1; i < starts.length; i++) {
      var g = Math.round((parseD(starts[i]) - parseD(starts[i - 1])) / 86400000);
      if (g >= 10 && g <= 90) gaps.push(g); // 明显异常的间隔不参与计算
    }
    if (gaps.length > 0) {
      avg = Math.round(gaps.reduce(function(a, b) { return a + b; }, 0) / gaps.length);
      if (avg < 21) avg = 21;
      if (avg > 45) avg = 45;
    }
  }
  var info = { avg: avg, nowText: '', nextText: '' };
  if (daysSince < 0) {
    info.nowText = '记的是将来的日子？看看日期对不对';
    return info;
  }
  if (daysSince < PERIOD_DAYS) {
    info.nowText = '经期第 <strong>' + (daysSince + 1) + '</strong> 天';
    if (avg != null) {
      var next0 = new Date(last); next0.setDate(next0.getDate() + avg);
      info.nextText = '按规律，下次约 ' + (next0.getMonth() + 1) + '/' + next0.getDate();
    }
    return info;
  }
  if (avg != null) {
    var next = new Date(last);
    next.setDate(next.getDate() + avg);
    var until = Math.round((next - today) / 86400000);
    if (until > 0) {
      info.nowText = '距下次预计还有 <strong>' + until + '</strong> 天';
      info.nextText = '下次约 ' + (next.getMonth() + 1) + '/' + next.getDate();
    } else {
      info.nowText = '按规律，已经 <strong>' + (-until) + '</strong> 天没来了';
      info.nextText = '只是参考，别自己吓自己';
    }
  } else {
    info.nowText = '距上次开始 <strong>' + daysSince + '</strong> 天';
  }
  return info;
}

// ---- 卡片排序 ----
function moveCustomCard(cardId, dir) {
  var cards = loadCustomCards();
  var i = -1;
  cards.forEach(function(c, idx) { if (c.id === cardId) i = idx; });
  var j = i + dir;
  if (i < 0 || j < 0 || j >= cards.length) return;
  var tmp = cards[i];
  cards[i] = cards[j];
  cards[j] = tmp;
  saveCustomCards(cards);
  openCustomManage();
  renderCustomPanel();
}

// ---- Sprint 4 init ----
function initSprint4() {
  renderFinancePanel();

  // 记一笔表单
  var finForm = document.getElementById('finance-form');
  if (finForm) finForm.addEventListener('submit', submitFinanceEntry);

  // 支出/收入切换
  document.querySelectorAll('.fin-type-toggle__btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setFinType(btn.dataset.finType); });
  });

  // 分类 chips
  document.querySelectorAll('#fin-cat-chips .fin-chip, #fin-cat-chips-income .fin-chip').forEach(function(chip) {
    chip.addEventListener('click', function() { setFinCategory(chip.dataset.cat); });
  });

  // 金额变化 → 大额时浮出「记进时间线」
  var finAmount = document.getElementById('fin-amount');
  if (finAmount) finAmount.addEventListener('input', updateFinTimelineField);

  // 存款 PIN 键盘
  document.querySelectorAll('#fin-unlock-modal .fin-pin-key').forEach(function(k) {
    k.addEventListener('click', function() {
      var v = k.dataset.pin;
      if (v === 'del') popFinPinDigit();
      else pushFinPinDigit(v);
    });
  });

  // 看板头部按钮
  var finAdd = document.getElementById('fin-add-btn');
  if (finAdd) finAdd.addEventListener('click', function() {
    if (isFinanceVisible()) openFinanceModal();
    else openFinUnlockModal();
  });
  var finRelock = document.getElementById('fin-relock-btn');
  if (finRelock) finRelock.addEventListener('click', function() {
    lockFinance();
    renderFinancePanel();
    showToast('已上锁', 'info');
  });

  // 看板内容（锁蒙层里的解锁按钮）事件委托
  var finSlide = document.getElementById('fin-slide-main');
  if (finSlide) {
    finSlide.addEventListener('click', function(e) {
      if (e.target.closest('[data-fin-unlock]')) openFinUnlockModal();
    });
  }

  // 周期卡表单
  var cycleForm = document.getElementById('cycle-form');
  if (cycleForm) cycleForm.addEventListener('submit', submitCycleStart);

  // 建卡弹窗：计数型才显示挂目标；选了目标才显示方向
  var ccType = document.getElementById('cc-type');
  if (ccType) ccType.addEventListener('change', function() {
    var goalField = document.getElementById('cc-goal-field');
    if (goalField) goalField.hidden = (ccType.value !== 'counter');
  });
  var ccGoal = document.getElementById('cc-goal');
  if (ccGoal) ccGoal.addEventListener('change', function() {
    var dirField = document.getElementById('cc-goal-dir-field');
    if (dirField) dirField.hidden = !ccGoal.value;
  });
}

// ============================================================
// Sprint 5：智能提醒 · 手环粘贴 · deadline 节点轴 · 数据备份 · 看板锁
// ============================================================

// ---- 存储 key ----
var STORAGE_SETTINGS_S5 = 'lifeos_settings';
var STORAGE_APPLOCK = 'lifeos_app_lock';
var SESSION_APP_UNLOCKED = 'lifeos_app_unlocked';

function loadSettingsS5() {
  return loadJSON(STORAGE_SETTINGS_S5, { smartReminders: true });
}
function saveSettingsS5(s) {
  saveJSON(STORAGE_SETTINGS_S5, s);
}

// ============================================================
// 1) 智能提醒：根据以往完成情况，人文语气，数据不够时静默
// ============================================================
function checkSmartReminders() {
  var settings = loadSettingsS5();
  if (!settings.smartReminders) return;

  var goals = loadGoals().filter(function(g) { return !g.completed; });
  var today = todayKey();
  var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayKey = formatDate(yesterday.toISOString());

  goals.forEach(function(g) {
    var checkins = g.checkins || [];
    // 数据够不够本提醒开口（计划表：攒 2-4 周才有意义，这里放低到 5 次/7 天）
    var created = g.createdAt ? new Date(g.createdAt) : null;
    var ageDays = created ? daysBetween(created, new Date()) : 0;
    if (checkins.length < 5 && ageDays < 7) return;

    var keyToday = 'smart_' + today + '_' + g.id;

    // a. 断签：昨天没打，但之前连续 >= 3 天
    var hadYesterday = checkins.some(function(c) { return c.date === yesterdayKey; });
    if (!hadYesterday) {
      var streakBefore = 0;
      var cursor = new Date(yesterday); cursor.setDate(cursor.getDate() - 1);
      while (checkins.some(function(c) { return c.date === formatDate(cursor.toISOString()); })) {
        streakBefore++;
        cursor.setDate(cursor.getDate() - 1);
      }
      if (streakBefore >= 3) {
        showReminderBanner(keyToday + '_break', '🌱',
          '「' + g.name + '」昨天断了，今天捡起来，连续重新起算',
          '去看看', function() { switchView('goals'); });
        return; // 一个目标一天只说一句
      }
    }

    // b. 节奏灯红了
    if (calcPace(g) === 'red') {
      showReminderBanner(keyToday + '_red', '🚦',
        '「' + g.name + '」的节奏灯变红了，看一眼要不要调',
        '去看看', function() { switchView('goals'); });
      return;
    }

    // c. 临期：deadline 7 天内且进度 < 70%
    if (g.deadline) {
      var remain = daysBetween(new Date(), g.deadline);
      var pct = Math.round(calcProgress(g) * 100);
      if (remain >= 0 && remain <= 7 && pct < 70) {
        showReminderBanner(keyToday + '_due', '⏳',
          '「' + g.name + '」还剩 ' + remain + ' 天，进度 ' + pct + '%',
          '去看看', function() { switchView('goals'); });
      }
    }
  });
}

// ============================================================
// 2) 手环数据粘贴导入（半自动，纯文本解析，不碰 API）
// ============================================================
function _watchParseDur(str) {
  if (!str) return null;
  var h = str.match(/(\d+)\s*(?:小时|h)/i);
  var m = str.match(/(\d+)\s*(?:分钟|分(?!钟)|m(?!o))/i);
  var total = 0;
  if (h) total += parseInt(h[1], 10) * 60;
  if (m) total += parseInt(m[1], 10);
  return total > 0 ? total : null;
}

function parseWatchText(text) {
  var out = {};
  var src = (text || '').replace(/清醒时间|醒来时间/g, '醒来');
  // 时间点
  var bt = src.match(/(?:入睡|上床|睡觉)[^\d]{0,8}(\d{1,2}):(\d{2})/);
  if (bt) out.bedtime = bt[1].padStart(2, '0') + ':' + bt[2];
  var wt = src.match(/(?:醒来|起床)[^\d]{0,8}(\d{1,2}):(\d{2})/);
  if (wt) out.waketime = wt[1].padStart(2, '0') + ':' + wt[2];
  // 分段时长
  var LABELS = [
    ['deepMin', /深睡|深眠/],
    ['lightMin', /浅睡|浅眠|轻睡/],
    ['awakeMin', /清醒|醒着/],
    ['napMinutes', /午睡|午休/]
  ];
  LABELS.forEach(function(L) {
    var idx = src.search(L[1]);
    if (idx === -1) return;
    var rest = src.slice(idx).replace(L[1], '');
    LABELS.forEach(function(L2) {
      var j = rest.search(L2[1]);
      if (j > 0) rest = rest.slice(0, j);
    });
    var dur = _watchParseDur(rest);
    if (dur) out[L[0]] = dur;
  });
  return out;
}

function _watchDescribe(parsed) {
  var parts = [];
  if (parsed.bedtime) parts.push('入睡 ' + parsed.bedtime);
  if (parsed.waketime) parts.push('醒来 ' + parsed.waketime);
  if (parsed.deepMin != null) parts.push('深睡 ' + parsed.deepMin + ' 分');
  if (parsed.lightMin != null) parts.push('浅睡 ' + parsed.lightMin + ' 分');
  if (parsed.awakeMin != null) parts.push('清醒 ' + parsed.awakeMin + ' 分');
  if (parsed.napMinutes != null) parts.push('午睡 ' + parsed.napMinutes + ' 分');
  return parts;
}

var _watchParsed = null;

function openWatchImportModal() {
  var modal = document.getElementById('watch-import-modal');
  if (!modal) return;
  document.getElementById('watch-input').value = '';
  document.getElementById('watch-import-error').textContent = '';
  var res = document.getElementById('watch-result');
  res.hidden = true;
  res.textContent = '';
  document.getElementById('watch-apply-btn').hidden = true;
  _watchParsed = null;
  openModal(modal);
  setTimeout(function() { document.getElementById('watch-input').focus(); }, 200);
}

function watchParseAndShow() {
  var text = document.getElementById('watch-input').value;
  var errEl = document.getElementById('watch-import-error');
  var resEl = document.getElementById('watch-result');
  errEl.textContent = '';
  var parsed = parseWatchText(text);
  var desc = _watchDescribe(parsed);
  if (desc.length === 0) {
    _watchParsed = null;
    resEl.hidden = true;
    document.getElementById('watch-apply-btn').hidden = true;
    errEl.textContent = '没认出来。试试写上「入睡 23:40」「深睡 1小时30分」这样的字。';
    return;
  }
  _watchParsed = parsed;
  resEl.hidden = false;
  resEl.textContent = '认出来了：' + desc.join(' · ');
  document.getElementById('watch-apply-btn').hidden = false;
}

function watchApplyToForm() {
  if (!_watchParsed) return;
  var p = _watchParsed;
  if (p.bedtime) document.getElementById('sleep-bedtime').value = p.bedtime;
  if (p.waketime) document.getElementById('sleep-waketime').value = p.waketime;
  if (p.deepMin != null) document.getElementById('sleep-deepMin').value = p.deepMin;
  if (p.lightMin != null) document.getElementById('sleep-lightMin').value = p.lightMin;
  if (p.awakeMin != null) document.getElementById('sleep-awakeMin').value = p.awakeMin;
  if (p.napMinutes != null) document.getElementById('sleep-napMinutes').value = p.napMinutes;
  // 手动刷新占比条（renderSleepPanel 会用旧记录覆盖，不能直接调）
  var bar = document.getElementById('sleep-ratio-bar');
  var ratioText = document.getElementById('sleep-ratio-text');
  if (bar) {
    var total = (p.deepMin || 0) + (p.lightMin || 0) + (p.awakeMin || 0);
    if (total > 0) {
      bar.innerHTML = '<div class="ratio-seg ratio-seg--deep" style="width:' + ((p.deepMin || 0) * 100 / total) + '%"></div>'
        + '<div class="ratio-seg ratio-seg--light" style="width:' + ((p.lightMin || 0) * 100 / total) + '%"></div>'
        + '<div class="ratio-seg ratio-seg--awake" style="width:' + ((p.awakeMin || 0) * 100 / total) + '%"></div>';
      if (ratioText) ratioText.textContent = '深 ' + Math.round((p.deepMin || 0) * 100 / total) + '% · 浅 ' + Math.round((p.lightMin || 0) * 100 / total) + '% · 醒 ' + Math.round((p.awakeMin || 0) * 100 / total) + '%';
    }
  }
  document.getElementById('watch-import-modal').hidden = true;
  showToast('已填进表单，确认无误就点「记下睡眠」', 'success');
}

// ============================================================
// 3) 真实数据驱动：deadline 节点轴（今日第三屏）
// ============================================================
function renderDeadlineAxis() {
  var slide = document.getElementById('today-slide-goals');
  if (!slide) return;
  var old = document.getElementById('deadline-axis');
  if (old) old.remove();

  var goals = loadGoals().filter(function(g) { return !g.completed && g.deadline; });
  var wrap = document.createElement('div');
  wrap.className = 'dl-axis';
  wrap.id = 'deadline-axis';

  if (goals.length === 0) {
    var anyGoal = loadGoals().some(function(g) { return !g.completed; });
    wrap.innerHTML = '<p class="dl-axis__hint">' + (anyGoal
      ? '给目标加上截止日，这里会长出一条节点轴'
      : '立一个带截止日的目标，节点轴会替你盯着') + '</p>';
    slide.appendChild(wrap);
    return;
  }

  goals.sort(function(a, b) { return new Date(a.deadline) - new Date(b.deadline); });
  var now = new Date();
  var minT = now.getTime();
  var maxT = new Date(goals[goals.length - 1].deadline).getTime();
  var span = Math.max(maxT - minT, 14 * 86400000); // 至少铺 14 天，节点不挤在右端

  var nodesHtml = goals.slice(0, 8).map(function(g) {
    var dd = new Date(g.deadline);
    var days = daysBetween(now, dd);
    var pct = Math.min(97, Math.max(3, (dd.getTime() - minT) / span * 100));
    var pace = calcPace(g);
    var cls = 'dl-node' + (pace === 'red' ? ' dl-node--red' : pace === 'yellow' ? ' dl-node--yellow' : ' dl-node--green')
      + (days < 0 ? ' dl-node--over' : '');
    return '<button type="button" class="' + cls + '" data-goal-go="' + g.id + '" style="left:' + pct + '%" '
      + 'title="' + escapeHtml(g.name) + ' · ' + (days < 0 ? '逾期 ' + (-days) + ' 天' : '还剩 ' + days + ' 天') + '">'
      + '<span class="dl-node__dot"></span>'
      + '<span class="dl-node__label">' + escapeHtml(g.name.length > 6 ? g.name.slice(0, 6) + '…' : g.name) + '</span>'
      + '</button>';
  }).join('');

  wrap.innerHTML = '<p class="dl-axis__title">⏱ 截止日节点轴 <small>点节点跳目标</small></p>'
    + '<div class="dl-axis__track"><div class="dl-axis__now" title="今天"></div>' + nodesHtml + '</div>';
  slide.appendChild(wrap);
}

// 挂在原渲染后面
var _renderTodayGoalsOrig = renderTodayGoals;
renderTodayGoals = function() {
  _renderTodayGoalsOrig();
  renderDeadlineAxis();
};

// ============================================================
// 4) 数据备份：导出 / 恢复（全部 lifeos_ 前缀）
// ============================================================
function exportBackup() {
  var data = {};
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf('lifeos_') === 0) data[k] = localStorage.getItem(k);
  }
  var payload = {
    app: 'LifeOS',
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: Object.keys(data).length,
    data: data
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'LifeOS_backup_' + todayKey() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 3000);
  showToast('备份已导出（' + payload.keys + ' 项数据），记得放安全的地方', 'success');
}

function importBackupFile(file) {
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var payload = JSON.parse(reader.result);
      if (payload.app !== 'LifeOS' || !payload.data) {
        showToast('这不是 LifeOS 的备份文件', 'error');
        return;
      }
      var ok = window.confirm(
        '恢复备份会覆盖当前全部 ' + Object.keys(payload.data).length + ' 项数据（导出于 '
        + (payload.exportedAt || '未知时间').slice(0, 10) + '）。\n\n确定继续吗？'
      );
      if (!ok) return;
      Object.keys(payload.data).forEach(function(k) {
        localStorage.setItem(k, payload.data[k]);
      });
      showToast('恢复完成，重新加载中…', 'success');
      setTimeout(function() { location.reload(); }, 800);
    } catch (e) {
      showToast('备份文件读不出来：' + e.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// 5) 看板级防窥锁 + 找回问题
// ============================================================
function loadAppLock() {
  return loadJSON(STORAGE_APPLOCK, null); // {pinHash, question, answerHash}
}
function isAppLocked() {
  return !!loadAppLock();
}
function isAppUnlockedThisSession() {
  try { return sessionStorage.getItem(SESSION_APP_UNLOCKED) === '1'; } catch (e) { return true; }
}

var _applockBuffer = '';
var _applockAction = 'unlock'; // 'unlock' | 'off'

function showAppLockScreen(action) {
  var screen = document.getElementById('applock-screen');
  if (!screen) return;
  _applockAction = action || 'unlock';
  _applockBuffer = '';
  _updateApplockDots();
  document.getElementById('applock-error').textContent = '';
  document.getElementById('applock-screen__title').textContent =
    _applockAction === 'off' ? '输 PIN 关闭看板锁' : 'LifeOS 上着锁';
  var lock = loadAppLock();
  document.getElementById('applock-recover-btn').hidden = !lock || !lock.question || _applockAction === 'off';
  var recoverBox = document.getElementById('applock-recover');
  if (recoverBox) recoverBox.hidden = true;
  screen.hidden = false;
}

function hideAppLockScreen() {
  var screen = document.getElementById('applock-screen');
  if (screen) screen.hidden = true;
}

function _updateApplockDots() {
  var dots = document.querySelectorAll('#applock-dots span');
  dots.forEach(function(d, i) {
    d.classList.toggle('is-filled', i < _applockBuffer.length);
  });
}

function _applockKey(k) {
  var lock = loadAppLock();
  if (!lock) return;
  if (k === 'del') {
    _applockBuffer = _applockBuffer.slice(0, -1);
    _updateApplockDots();
    return;
  }
  if (k === 'ok') {
    if (_applockBuffer.length === 4) _applockVerify(lock);
    return;
  }
  if (_applockBuffer.length >= 4) return;
  _applockBuffer += k;
  _updateApplockDots();
  if (_applockBuffer.length === 4) setTimeout(function() { _applockVerify(lock); }, 150);
}

function _applockVerify(lock) {
  if (verifyPin(_applockBuffer, lock.pinHash)) {
    if (_applockAction === 'off') {
      saveJSON(STORAGE_APPLOCK, null);
      localStorage.removeItem(STORAGE_APPLOCK);
      showToast('看板锁已关闭，正在刷新…', 'success');
    } else {
      try { sessionStorage.setItem(SESSION_APP_UNLOCKED, '1'); } catch (e) {}
      showToast('解锁成功，正在刷新…', 'success');
    }
    setTimeout(function() { location.reload(); }, 500);
  } else {
    document.getElementById('applock-error').textContent = 'PIN 不对，再试一次';
    _applockBuffer = '';
    setTimeout(_updateApplockDots, 300);
  }
}

function _applockRecoverShow() {
  var lock = loadAppLock();
  if (!lock || !lock.question) return;
  var box = document.getElementById('applock-recover');
  document.getElementById('applock-recover-q').textContent = lock.question;
  document.getElementById('applock-recover-a').value = '';
  document.getElementById('applock-recover-error').textContent = '';
  box.hidden = false;
}

function _applockRecoverVerify() {
  var lock = loadAppLock();
  var input = document.getElementById('applock-recover-a').value.trim().toLowerCase();
  if (!lock || simpleHashPin(input) !== lock.answerHash) {
    document.getElementById('applock-recover-error').textContent = '答案不对';
    return;
  }
  // 答对了：直接解锁 + 引导重设 PIN
  try { sessionStorage.setItem(SESSION_APP_UNLOCKED, '1'); } catch (e) {}
  showToast('验证通过。建议去 设置 → 看板防窥锁 换个新 PIN', 'success');
  setTimeout(function() { location.reload(); }, 500);
}

function _bindLockKeys() {
  var keys = document.getElementById('applock-keys');
  if (keys) {
    keys.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-key]');
      if (btn) _applockKey(btn.dataset.key);
    });
  }
  var recoverBtn = document.getElementById('applock-recover-btn');
  if (recoverBtn) recoverBtn.addEventListener('click', _applockRecoverShow);
  var recoverBack = document.getElementById('applock-recover-back');
  if (recoverBack) recoverBack.addEventListener('click', function() {
    document.getElementById('applock-recover').hidden = true;
  });
  var recoverOk = document.getElementById('applock-recover-ok');
  if (recoverOk) recoverOk.addEventListener('click', _applockRecoverVerify);
  var recoverInput = document.getElementById('applock-recover-a');
  if (recoverInput) {
    recoverInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); _applockRecoverVerify(); }
    });
  }
}

function openApplockSetupModal() {
  var modal = document.getElementById('applock-setup-modal');
  if (!modal) return;
  var lock = loadAppLock();
  document.getElementById('applock-setup-title').textContent = lock ? '修改看板锁' : '开启看板锁';
  document.getElementById('applock-pin').value = '';
  document.getElementById('applock-question').value = lock ? (lock.question || '') : '';
  document.getElementById('applock-answer').value = '';
  document.getElementById('applock-setup-error').textContent = '';
  openModal(modal);
  setTimeout(function() { document.getElementById('applock-pin').focus(); }, 200);
}

function saveApplockFromForm() {
  var pin = document.getElementById('applock-pin').value.trim();
  var question = document.getElementById('applock-question').value.trim();
  var answer = document.getElementById('applock-answer').value.trim();
  var errEl = document.getElementById('applock-setup-error');

  if (!/^\d{4}$/.test(pin)) { errEl.textContent = 'PIN 要 4 位数字'; return; }
  if (question.length < 4) { errEl.textContent = '找回问题至少 4 个字，不然将来自己也想不起来'; return; }
  if (answer.length < 1) { errEl.textContent = '答案不能为空'; return; }

  saveJSON(STORAGE_APPLOCK, {
    pinHash: simpleHashPin(pin),
    question: question,
    answerHash: simpleHashPin(answer.toLowerCase())
  });
  document.getElementById('applock-setup-modal').hidden = true;
  try { sessionStorage.setItem(SESSION_APP_UNLOCKED, '1'); } catch (e) {}
  showToast('看板锁已生效，下次打开要先输 PIN', 'success');
  refreshSettingsUI();
}

function refreshSettingsUI() {
  // 智能提醒开关
  var settings = loadSettingsS5();
  var toggle = document.getElementById('smart-reminder-toggle');
  if (toggle) toggle.classList.toggle('is-on', !!settings.smartReminders);
  // 看板锁状态
  var lock = loadAppLock();
  var hint = document.getElementById('applock-status-hint');
  var offBtn = document.getElementById('applock-off-btn');
  var setupBtn = document.getElementById('applock-setup-btn');
  if (hint) hint.textContent = lock ? '已开启。每次打开 LifeOS 都要先输 PIN。' : '未开启。开启后每次打开 LifeOS 都要先输 PIN。';
  if (offBtn) offBtn.hidden = !lock;
  if (setupBtn) setupBtn.textContent = lock ? '修改 PIN / 找回问题' : '开启 / 修改';
}

// ============================================================
// Sprint 5 初始化
// ============================================================
function initSprint5() {
  // 智能提醒（在原有 checkReminders 之后跑）
  setTimeout(checkSmartReminders, 600);

  // 设置弹窗
  var settingsBtn = document.getElementById('settings-btn');
  var settingsModal = document.getElementById('settings-modal');
  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', function() {
      refreshSettingsUI();
      openModal(settingsModal);
    });
    settingsModal.querySelectorAll('[data-close-settings]').forEach(function(el) {
      el.addEventListener('click', function() { settingsModal.hidden = true; });
    });
  }

  // 智能提醒开关
  var toggle = document.getElementById('smart-reminder-toggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var s = loadSettingsS5();
      s.smartReminders = !s.smartReminders;
      saveSettingsS5(s);
      refreshSettingsUI();
      showToast(s.smartReminders ? '人文提醒已开' : '人文提醒已关，世界清静了', 'success');
    });
  }

  // 看板锁设置
  var setupBtn = document.getElementById('applock-setup-btn');
  if (setupBtn) setupBtn.addEventListener('click', function() {
    document.getElementById('settings-modal').hidden = true;
    openApplockSetupModal();
  });
  var offBtn = document.getElementById('applock-off-btn');
  if (offBtn) offBtn.addEventListener('click', function() {
    document.getElementById('settings-modal').hidden = true;
    showAppLockScreen('off');
    _bindLockKeys();
  });
  var lockForm = document.getElementById('applock-setup-form');
  if (lockForm) {
    lockForm.addEventListener('submit', function(e) {
      e.preventDefault();
      saveApplockFromForm();
    });
    document.querySelectorAll('[data-close-applock-setup]').forEach(function(el) {
      el.addEventListener('click', function() {
        document.getElementById('applock-setup-modal').hidden = true;
      });
    });
  }

  // 数据备份
  var exportBtn = document.getElementById('backup-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportBackup);
  var importBtn = document.getElementById('backup-import-btn');
  var fileInput = document.getElementById('backup-file-input');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function() {
      if (fileInput.files && fileInput.files[0]) importBackupFile(fileInput.files[0]);
      fileInput.value = '';
    });
  }

  // 手环粘贴
  var watchBtn = document.getElementById('watch-btn');
  if (watchBtn) watchBtn.addEventListener('click', openWatchImportModal);
  var watchModal = document.getElementById('watch-import-modal');
  if (watchModal) {
    watchModal.querySelectorAll('[data-close-watch]').forEach(function(el) {
      el.addEventListener('click', function() { watchModal.hidden = true; });
    });
  }
  var parseBtn = document.getElementById('watch-parse-btn');
  if (parseBtn) parseBtn.addEventListener('click', watchParseAndShow);
  var applyBtn = document.getElementById('watch-apply-btn');
  if (applyBtn) applyBtn.addEventListener('click', watchApplyToForm);
  // 表单内按回车也不允许触发默认提交（会刷新页面清掉解析结果）
  var watchForm = document.getElementById('watch-import-form');
  if (watchForm) watchForm.addEventListener('submit', function(e) { e.preventDefault(); });
}
