/* Sprint 7 冒烟：去压力化 + 文案引擎挂载与核心行为不报错 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8765';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  ok('页面加载无 JS 报错', errors.length === 0, errors);

  // 1. Sprint 7 函数全部挂载
  const fns = ['initSprint7','copyToast','copyCheckinResponse','sensitiveCardRespond','copySundayReport','copyMonthReport','maybeAskMidnight','checkOpenMomentCopy','applyStressLayout','renderGoalSuggestion','autoPostponeItems','checkCounterThresholds','getRestDaySet','consecutiveBadSleepDays'];
  for (const f of fns) {
    const has = await page.evaluate(fn => typeof window[fn] === 'function', f);
    ok('挂载 ' + f, has);
  }

  // 2. 文案引擎：造一个目标打卡，验证 copyCheckinResponse 分支
  const copyText = await page.evaluate(() => {
    const old = localStorage.getItem('lifeos_goals');
    const id = 'smoke_goal_1';
    localStorage.setItem('lifeos_goals', JSON.stringify([{
      id, name: '冒烟目标', type: '习惯', checkins: [], createdAt: '2026-10-01'
    }]));
    try {
      copyCheckinResponse({ id, name: '冒烟目标', checkins: [] }, null, false, null);
      return 'called';
    } catch (e) { return 'ERR:' + e.message; }
  });
  ok('copyCheckinResponse 首次打卡可调用', copyText === 'called', copyText);

  // 3. 压力布局函数可调用（睡眠差重排）
  const stress = await page.evaluate(() => {
    try { applyStressLayout(); return 'called'; } catch (e) { return 'ERR:' + e.message; }
  });
  ok('applyStressLayout 可调用', stress === 'called', stress);

  // 4. 深夜关怀 / 开屏文案定时器不抛错
  const timers = await page.evaluate(() => {
    try { maybeAskMidnight(); checkOpenMomentCopy(); return 'called'; } catch (e) { return 'ERR:' + e.message; }
  });
  ok('maybeAskMidnight / checkOpenMomentCopy 可调用', timers === 'called', timers);

  // 5. 全程无页面错误
  ok('结束时无 JS 报错', errors.length === 0, errors);

  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
