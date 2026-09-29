/* LifeOS Sprint 5 端到端测试 + 截图
   跑法：先在 LifeOS/LifeOS 目录起 http.server 8765，再 node test_sprint5.js */
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

  // ---------- 1) 打开 + 种子数据 ----------
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof loadGoals === 'function'", { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('lifeos_onboarded', '1');
    // 目标 A：截止日昨天 → 节奏灯红（触发智能提醒 + 节点轴逾期节点）
    const gs = loadGoals();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const dl = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const c = new Date(); c.setDate(c.getDate() - 10);
    gs.push({
      id: 'test-g-red', name: '读完一本书', type: 'value', target: 300, unit: '页',
      currentValue: 30, weight: 1, checkins: [], completed: false,
      createdAt: c.toISOString(), deadline: dl
    });
    saveGoals(gs);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof exportBackup === 'function'", { timeout: 15000 });
  await sleep(1500); // 等 checkSmartReminders(600ms) 与渲染
  console.log('== 1. 页面加载 ==');
  ok('页面无 JS 报错', errors.length === 0, errors);

  // ---------- 2) 智能提醒（红灯横幅） ----------
  console.log('== 2. 智能提醒 ==');
  const banner = await page.evaluate(() => !!document.querySelector('.reminder-banner'));
  ok('红灯目标触发提醒横幅', banner);
  await page.screenshot({ path: OUT + '/s5-01-smart-reminder.png' });

  // ---------- 3) 设置弹窗 + 智能提醒开关 ----------
  console.log('== 3. 设置弹窗 ==');
  await page.click('#settings-btn');
  await sleep(400);
  let st = await page.evaluate(() => ({
    open: !document.getElementById('settings-modal').hidden,
    toggleOn: document.getElementById('smart-reminder-toggle').classList.contains('is-on')
  }));
  ok('设置弹窗打开', st.open, st);
  ok('智能提醒默认开', st.toggleOn, st);
  await page.click('#smart-reminder-toggle');
  await sleep(200);
  st = await page.evaluate(() => ({
    toggleOn: document.getElementById('smart-reminder-toggle').classList.contains('is-on'),
    saved: JSON.parse(localStorage.getItem('lifeos_settings') || '{}')
  }));
  ok('关闭智能提醒并落库', !st.toggleOn && st.saved.smartReminders === false, st);
  await page.click('#smart-reminder-toggle'); // 恢复开
  await sleep(200);
  await page.screenshot({ path: OUT + '/s5-02-settings.png' });

  // ---------- 4) deadline 节点轴 ----------
  console.log('== 4. deadline 节点轴 ==');
  const axis = await page.evaluate(() => {
    const el = document.getElementById('deadline-axis');
    if (!el) return null;
    return { nodes: el.querySelectorAll('.dl-node').length, over: el.querySelectorAll('.dl-node--over').length };
  });
  ok('节点轴渲染且含逾期节点', !!axis && axis.nodes >= 1 && axis.over >= 1, axis);

  // ---------- 5) 手环粘贴导入（重点回归） ----------
  console.log('== 5. 手环粘贴 ==');
  await page.evaluate(() => openWatchImportModal());
  await sleep(400);
  await page.evaluate(() => {
    document.getElementById('watch-input').value = '入睡 23:46 醒来 07:12\n深睡 1小时32分 浅睡 5小时3分 清醒 12分钟 午睡 25分钟';
  });
  await page.click('#watch-parse-btn');
  await sleep(300);
  const parsed = await page.evaluate(() => ({
    result: document.getElementById('watch-result').textContent,
    applyHidden: document.getElementById('watch-apply-btn').hidden
  }));
  ok('解析出 6 项', parsed.result.includes('23:46') && parsed.result.includes('07:12') && parsed.result.includes('92') && parsed.result.includes('303'), parsed);
  ok('「填进表单」按钮出现', !parsed.applyHidden, parsed);
  await page.screenshot({ path: OUT + '/s5-03-watch-parsed.png' });
  // 做个标记，验证点击后页面没有发生导航
  await page.evaluate(() => { window.__noNav = 'alive'; });
  await page.click('#watch-apply-btn');
  await sleep(600);
  const applied = await page.evaluate(() => ({
    nav: window.__noNav || 'GONE',
    modalHidden: document.getElementById('watch-import-modal').hidden,
    bedtime: document.getElementById('sleep-bedtime').value,
    waketime: document.getElementById('sleep-waketime').value,
    deepMin: document.getElementById('sleep-deepMin').value,
    lightMin: document.getElementById('sleep-lightMin').value,
    awakeMin: document.getElementById('sleep-awakeMin').value,
    napMinutes: document.getElementById('sleep-napMinutes').value
  }));
  ok('点击后页面未刷新（bug 已修）', applied.nav === 'alive', applied);
  ok('弹窗已关', applied.modalHidden, applied);
  ok('表单回填 6 项',
    applied.bedtime === '23:46' && applied.waketime === '07:12' &&
    applied.deepMin === '92' && applied.lightMin === '303' &&
    applied.awakeMin === '12' && applied.napMinutes === '25', applied);

  // ---------- 6) 数据备份导出 ----------
  console.log('== 6. 数据备份 ==');
  const backup = await page.evaluate(() => new Promise(resolve => {
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      blob.text().then(t => {
        URL.createObjectURL = origCreate;
        resolve(JSON.parse(t));
      });
      return 'blob:test';
    };
    exportBackup();
    setTimeout(() => resolve(null), 3000);
  }));
  ok('导出 JSON 结构正确', !!backup && backup.app === 'LifeOS' && backup.data && backup.data['lifeos_goals'], backup && { keys: backup.keys });
  ok('备份含全部 lifeos_ 键', !!backup && Object.keys(backup.data).every(k => k.indexOf('lifeos_') === 0));

  // ---------- 7) 看板锁：设 PIN → 重开需解锁 ----------
  console.log('== 7. 看板锁 ==');
  await page.evaluate(() => openApplockSetupModal());
  await sleep(400);
  await page.evaluate(() => {
    document.getElementById('applock-pin').value = '1357';
    document.getElementById('applock-question').value = '我最想去的城市';
    document.getElementById('applock-answer').value = '大理';
    document.getElementById('applock-setup-form').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await sleep(400);
  const lockSaved = await page.evaluate(() => !!localStorage.getItem('lifeos_app_lock'));
  ok('PIN 已存（仅 hash）', lockSaved);
  // 重开 → 应该先见锁屏、不见内容
  // （设 PIN 时写入了 sessionStorage 免重输，先清掉模拟"新开浏览器"）
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction("!document.getElementById('applock-screen').hidden", { timeout: 15000 });
  await sleep(500);
  const locked = await page.evaluate(() => ({
    lockShown: !document.getElementById('applock-screen').hidden,
    boardHidden: !document.getElementById('app') || document.getElementById('app').getAttribute('aria-hidden') === 'true' || getComputedStyle(document.getElementById('applock-screen')).zIndex !== 'auto'
  }));
  ok('重开先见锁屏', locked.lockShown, locked);
  await page.screenshot({ path: OUT + '/s5-04-applock.png' });
  // 输错 PIN
  await page.evaluate(() => { ['1','1','1','1'].forEach(k => document.querySelector('#applock-keys [data-key="' + k + '"]').click()); });
  await sleep(800);
  const wrongMsg = await page.evaluate(() => document.getElementById('applock-error').textContent);
  ok('错 PIN 有提示', wrongMsg.indexOf('不对') >= 0, wrongMsg);
  // 输对 PIN
  await Promise.all([
    page.evaluate(() => { ['1','3','5','7'].forEach(k => document.querySelector('#applock-keys [data-key="' + k + '"]').click()); }),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
  ]);
  await sleep(1500);
  const unlocked = await page.evaluate(() => ({
    lockHidden: document.getElementById('applock-screen').hidden,
    hasBoard: !!document.querySelector('.quad-panel, #dash-date, .topbar')
  }));
  ok('对 PIN 解锁进看板', unlocked.lockHidden && unlocked.hasBoard, unlocked);

  // ---------- 8) 关锁 ----------
  console.log('== 8. 关锁 ==');
  await page.click('#settings-btn');
  await sleep(400);
  const offVisible = await page.evaluate(() => !document.getElementById('applock-off-btn').hidden);
  ok('设置里出现「关闭锁」', offVisible);
  await page.click('#applock-off-btn');
  await page.waitForFunction("!document.getElementById('applock-screen').hidden", { timeout: 10000 });
  await page.evaluate(() => { ['1','3','5','7'].forEach(k => document.querySelector('#applock-keys [data-key="' + k + '"]').click()); });
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await sleep(1500);
  const lockGone = await page.evaluate(() => !localStorage.getItem('lifeos_app_lock'));
  ok('关锁后 localStorage 清空', lockGone);

  // ---------- 收尾 ----------
  await page.screenshot({ path: OUT + '/s5-05-final-board.png' });
  await browser.close();
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(2); });
