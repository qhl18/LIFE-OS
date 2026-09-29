/* LifeOS Sprint 6 端到端测试 + 截图
   覆盖：趋势周/月切换（睡眠/存款/目标详情） + 照片附件（IndexedDB）
   跑法：LifeOS/LifeOS 目录起 http.server 8765，再 node test_sprint6.js */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8765';
const OUT = 'C:/Users/qiand/Desktop/LifeOS/shots';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
// 生成一张 1x1 测试 PNG
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
fs.writeFileSync(OUT + '/../_test_photo.png', PNG_1PX);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,1000'],
    defaultViewport: { width: 1280, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [页面console.' + m.type() + ']', m.text().slice(0, 200)); });

  // ---------- 1) 打开 + 种子 ----------
  let loaded = false, lastErr = null;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      loaded = true;
    } catch (e) { lastErr = e; console.log('  (goto 重试 ' + (attempt + 1) + ')'); }
  }
  if (!loaded) throw lastErr;
  await page.waitForFunction("typeof saveSleep === 'function'", { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('lifeos_onboarded', '1');
    // 睡眠：10 天记录（周视图 7 天有值，月视图 10 天有值）
    const arr = [];
    for (let i = 9; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      arr.push({ date: key, bedtime: '23:30', waketime: '07:10', deepMin: '80', lightMin: '240', awakeMin: '20', napMinutes: '', note: '' });
    }
    saveSleep(arr);
    // 存款：今天一笔 + 10 天前一笔（30 天窗口内）+ 45 天前一笔（窗口外）
    const mk = off => { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
    saveFinance([
      { id: 'f1', type: 'expense', amount: 50, date: todayKey(), category: '吃饭', note: '' },
      { id: 'f2', type: 'expense', amount: 120, date: mk(10), category: '十天前分类', note: '' },
      { id: 'f3', type: 'expense', amount: 200, date: mk(45), category: '旧账分类', note: '' }
    ]);
    // 目标：一个有打卡的（趋势图可切）
    const gs = loadGoals();
    const c = new Date(); c.setDate(c.getDate() - 12);
    gs.push({ id: 'test-g-trend', name: '每日冥想', type: 'habit', target: 20, unit: '次',
      currentValue: 0, weight: 1, completed: false, createdAt: c.toISOString(),
      checkins: [1,2,3,5,6,8,9,11,12].map(off => {
        const d = new Date(); d.setDate(d.getDate() - off);
        return { date: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'), amount: 1 };
      }) });
    saveGoals(gs);
    // 清掉可能存在的锁，避免干扰
    localStorage.removeItem('lifeos_app_lock');
    localStorage.removeItem('lifeos_fin_lock');
    localStorage.removeItem('lifeos_fin_cat_range');
    // 清掉历史测试的卡片/记录，保证确定性
    saveCustomCards([]);
    saveCustomEntries([]);
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 }));
  await page.waitForFunction("typeof renderSleepTrend === 'function'", { timeout: 15000 });
  await sleep(1500);
  console.log('== 1. 页面加载 ==');
  ok('页面无 JS 报错', errors.length === 0, errors);

  // ---------- 2) 睡眠趋势 周/月切换 ----------
  console.log('== 2. 睡眠趋势切换 ==');
  let st = await page.evaluate(() => {
    const el = document.getElementById('sleep-trend-chart');
    return {
      title: el.querySelector('.sleep-trend__title') ? el.querySelector('.sleep-trend__title').textContent : '',
      pills: el.querySelectorAll('[data-sleep-range]').length,
      dots: el.querySelectorAll('circle').length
    };
  });
  ok('周视图默认（近 7 天）', st.title.indexOf('近 7 天') >= 0, st);
  ok('切换 pills 存在', st.pills === 2, st);
  await page.click('[data-sleep-range="month"]');
  await sleep(300);
  st = await page.evaluate(() => {
    const el = document.getElementById('sleep-trend-chart');
    return {
      title: el.querySelector('.sleep-trend__title').textContent,
      saved: localStorage.getItem('lifeos_sleep_trend_range'),
      labels: el.querySelectorAll('.sleep-trend__label').length
    };
  });
  ok('切到月视图（近 30 天）', st.title.indexOf('近 30 天') >= 0, st);
  ok('月视图状态落库', st.saved === '"month"', st);
  ok('月视图标签稀疏（10 数据点 → ≤4 标签）', st.labels >= 2 && st.labels <= 4, st);
  await page.click('[data-sleep-range="week"]');
  await sleep(200);
  st = await page.evaluate(() => document.getElementById('sleep-trend-chart').querySelector('.sleep-trend__title').textContent);
  ok('切回周视图', st.indexOf('近 7 天') >= 0, st);
  await page.screenshot({ path: OUT + '/s6-01-sleep-trend.png' });

  // ---------- 3) 存款分类 本月/30天切换 ----------
  console.log('== 3. 存款分类切换 ==');
  // 解锁存款（首次 = 设 PIN）
  await page.evaluate(() => openFinUnlockModal());
  await sleep(300);
  await page.evaluate(() => { ['1','2','3','4'].forEach(k => document.querySelector('#fin-unlock-modal [data-pin="' + k + '"]').click()); });
  await sleep(300);
  await page.evaluate(() => { ['1','2','3','4'].forEach(k => document.querySelector('#fin-unlock-modal [data-pin="' + k + '"]').click()); });
  await sleep(500);
  let fin = await page.evaluate(() => {
    const slide = document.getElementById('fin-slide-main');
    return {
      unlocked: !!slide.querySelector('.fin-balance'),
      title: slide.querySelector('.fin-cats__title') ? slide.querySelector('.fin-cats__title').textContent : '',
      hasOldCat: slide.textContent.indexOf('旧账分类') >= 0,
      hasNewCat: slide.textContent.indexOf('吃饭') >= 0
    };
  });
  ok('存款解锁成功', fin.unlocked, fin);
  ok('默认本月视图', fin.title.indexOf('本月') >= 0, fin);
  ok('本月不含 45 天前的旧分类', !fin.hasOldCat, fin);
  ok('本月含今天的「吃饭」', fin.hasNewCat, fin);
  // 诊断：点击前看 pill 的位置和遮挡情况
  const finDiag = await page.evaluate(() => {
    const p = document.querySelector('[data-fin-range="d30"]');
    const r = p.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, hitIsPill: hit === p || (hit && hit.closest && !!hit.closest('[data-fin-range]')) };
  });
  console.log('  (fin pill 诊断:', JSON.stringify(finDiag) + ')');
  await page.click('[data-fin-range="d30"]').catch(() => {});
  await sleep(300);
  // 坐标点击可能因 pill 超出视口落空（面板在视口底部），DOM click 兜底后统一读取
  await page.evaluate(() => {
    const t = document.querySelector('#fin-slide-main .fin-cats__title');
    if (!t || t.textContent.indexOf('30 天') < 0) document.querySelector('[data-fin-range="d30"]').click();
  });
  await sleep(300);
  fin = await page.evaluate(() => {
    const slide = document.getElementById('fin-slide-main');
    const txt = slide.textContent;
    return { title: slide.querySelector('.fin-cats__title').textContent, hasOldCat: txt.indexOf('旧账分类') >= 0, hasMidCat: txt.indexOf('十天前分类') >= 0 };
  });
  ok('切到 30 天视图', fin.title.indexOf('30 天') >= 0, fin);
  ok('30 天视图含 10 天前的分类', fin.hasMidCat, fin);
  ok('30 天视图不含 45 天前旧分类', !fin.hasOldCat, fin);
  await page.screenshot({ path: OUT + '/s6-02-finance-range.png' });

  // ---------- 4) 目标详情趋势 周/月切换 ----------
  console.log('== 4. 目标趋势切换 ==');
  await page.evaluate(() => { switchView('goals'); });
  await sleep(400);
  // 打开目标详情（点目标卡片）
  const opened = await page.evaluate(() => {
    const g = loadGoals().find(x => x.id === 'test-g-trend');
    openGoalDetail(g.id);
    return true;
  });
  await sleep(600);
  let gt = await page.evaluate(() => {
    const pills = document.querySelectorAll('.modal:not([hidden]) [data-trend-range]');
    const canvas = document.getElementById('trend-canvas');
    return { pills: pills.length, hasCanvas: !!canvas, saved: localStorage.getItem('lifeos_trend_range') };
  });
  ok('目标详情打开且趋势 pills 存在', opened && gt.pills === 2 && gt.hasCanvas, gt);
  const monthActive = await page.evaluate(() => document.querySelector('.modal:not([hidden]) [data-trend-range="month"]').classList.contains('is-active'));
  ok('月视图默认激活', monthActive);
  await page.click('.modal:not([hidden]) [data-trend-range="week"]');
  await sleep(400);
  gt = await page.evaluate(() => ({
    saved: localStorage.getItem('lifeos_trend_range'),
    weekActive: document.querySelector('.modal:not([hidden]) [data-trend-range="week"]').classList.contains('is-active'),
    labels: Array.from(document.querySelectorAll('.section-title')).some(t => t.textContent === '趋势')
  }));
  ok('切到周视图并落库', gt.saved === '"week"' && gt.weekActive, gt);
  await page.screenshot({ path: OUT + '/s6-03-goal-trend.png' });
  await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.hidden = true); });

  // ---------- 5) 照片附件（IndexedDB） ----------
  console.log('== 5. 照片附件 ==');
  // 建一张文字卡
  await page.evaluate(() => openCustomCardModal());
  await sleep(300);
  await page.evaluate(() => {
    document.getElementById('cc-name').value = '心情手记';
    document.getElementById('cc-type').value = 'text';
    document.getElementById('custom-card-form').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await sleep(400);
  let card = await page.evaluate(() => {
    const c = loadCustomCards().find(x => x.name === '心情手记');
    return c ? c.id : null;
  });
  ok('文字卡创建成功', !!card, card);
  // 打开写一笔
  await page.evaluate((cid) => openCustomTextModal(cid), card);
  await sleep(300);
  const photoUI = await page.evaluate(() => ({
    btn: !!document.getElementById('ct-photo-btn'),
    input: !!document.getElementById('ct-photo-input'),
    modalOpen: !document.getElementById('custom-text-modal').hidden
  }));
  ok('写一笔弹窗含照片按钮', photoUI.btn && photoUI.input && photoUI.modalOpen, photoUI);
  // 传照片（页面内构造 File + DataTransfer，模拟真实文件选择器；
  // 不用 puppeteer uploadFile——CDP 注入的磁盘文件偶发 ERR_ACCESS_DENIED，File 数据读不到）
  await page.evaluate(async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'test-photo.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('ct-photo-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  let pending = await page.evaluate(() => ({
    thumbs: document.querySelectorAll('#ct-photo-thumbs img').length,
    hint: !document.getElementById('ct-photo-hint').hidden
  }));
  ok('选图后出现缩略图与提示', pending.thumbs === 1 && pending.hint, pending);
  await page.screenshot({ path: OUT + '/s6-04-photo-pending.png' });
  // 填文字 + 提交（先挂钩子记录 photoPut 调用）
  await page.evaluate(() => {
    window._putCalls = [];
    const orig = photoPut;
    window.photoPut = function(id, blob) { window._putCalls.push({ id: id, ok: blob instanceof Blob, size: blob && blob.size }); return orig(id, blob); };
    document.getElementById('ct-text').value = '今天试了照片附件';
  });
  await page.evaluate(() => document.getElementById('custom-text-form').dispatchEvent(new Event('submit', { cancelable: true })));
  await sleep(800);
  const savedEntry = await page.evaluate((cid) => {
    const e = loadCustomEntries().filter(x => x.cardId === cid).pop();
    return e ? { text: e.text, photos: (e.photoIds || []).length, pid: (e.photoIds || [])[0] } : null;
  }, card);
  ok('记录落库且带 photoIds', !!savedEntry && savedEntry.text === '今天试了照片附件' && savedEntry.photos === 1, savedEntry);
  // IndexedDB 里真的有
  const inDB = await page.evaluate(async (pid) => {
    let size = 0, err = '';
    try { const b = await photoGet(pid); size = b ? b.size : 0; } catch (e) { err = e.message; }
    return { size: size, err: err, putCalls: window._putCalls || [] };
  }, savedEntry && savedEntry.pid);
  ok('照片存进 IndexedDB', inDB.size > 0, inDB);
  // 卡片上缩略图水合出来
  await sleep(600);
  const hydrated = await page.evaluate(() => {
    const img = document.querySelector('img[data-cc-photo]');
    return img ? { shown: !!img.src && img.src.indexOf('blob:') === 0, visible: img.style.display !== 'none' } : null;
  });
  ok('卡片缩略图水合显示', !!hydrated && hydrated.shown, hydrated);
  await page.screenshot({ path: OUT + '/s6-05-photo-card.png' });
  // 点缩略图 → 大图（DOM click，避免视口/遮挡问题）
  await page.evaluate(() => { const img = document.querySelector('img[data-cc-photo]'); if (img) img.click(); });
  await sleep(300);
  const viewer = await page.evaluate(() => !!document.querySelector('.cc-photo-viewer'));
  ok('点缩略图打开大图', viewer);
  await page.screenshot({ path: OUT + '/s6-06-photo-viewer.png' });
  await page.evaluate(() => { const v = document.querySelector('.cc-photo-viewer'); if (v) v.remove(); });

  // ---------- 收尾 ----------
  await browser.close();
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(2); });
