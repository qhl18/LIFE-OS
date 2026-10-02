/* LifeOS Sprint 8 端到端测试
   覆盖：恢复出厂（设置项+函数安全） / 表格导入（解析→预览→落库） / OCR 引擎文件就位 / PWA 基础
   跑法：LifeOS/LifeOS 目录起 http.server 8765，再 node test_sprint8.js */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8765';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,1000'],
    defaultViewport: { width: 1280, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ---------- 1) 打开 ----------
  let loaded = false, lastErr = null;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      loaded = true;
    } catch (e) { lastErr = e; console.log('  (goto 重试 ' + (attempt + 1) + ')'); }
  }
  if (!loaded) throw lastErr;
  await page.waitForFunction("typeof initSprint8 === 'function'", { timeout: 15000 });
  await page.evaluate(() => { localStorage.setItem('lifeos_onboarded', '1'); localStorage.removeItem('lifeos_app_lock'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  ok('页面加载无 JS 报错', errors.length === 0, errors);

  // ---------- 2) 恢复出厂 ----------
  const factory = await page.evaluate(() => ({
    btn: !!document.getElementById('factory-reset-btn'),
    fn: typeof factoryReset === 'function',
    safeCancel: (() => {
      window.confirm = () => false;           // 点取消：必须什么都不清
      localStorage.setItem('lifeos_smoketest', '1');
      factoryReset();
      return localStorage.getItem('lifeos_smoketest') === '1';
    })()
  }));
  ok('设置里有「清空全部数据」按钮', factory.btn);
  ok('factoryReset 函数存在', factory.fn);
  ok('取消确认时不清任何数据', factory.safeCancel);

  // ---------- 3) 表格导入：解析层 ----------
  const parse = await page.evaluate(() => {
    const days = _timportParseDays('一,三,五');
    const t1 = _timportParseRange('08:00-09:40');
    const t2 = _timportParseTime('8点');
    const rows = _timportParseText('星期\t时间\t课程\t地点\n周一\t08:00-09:40\t高数\t教一101\n周三,周五\t14:00\t英语\n周六\t\t自习');
    const auto = _timportAutoMap(rows);
    const items = _timportBuildItems(rows, auto.mapping, auto.hasHeader);
    return { days, t1, t2, auto, items };
  });
  ok('星期解析「一,三,五」→ [1,3,5]', JSON.stringify(parse.days) === '[1,3,5]', parse.days);
  ok('时间区间「08:00-09:40」', parse.t1.start === '08:00' && parse.t1.end === '09:40', parse.t1);
  ok('「8点」→ 08:00', parse.t2 === '08:00', parse.t2);
  ok('自动识别表头', parse.auto.hasHeader === true, parse.auto);
  ok('列映射猜中（day/start/title）', parse.auto.mapping[0] === 'day' && parse.auto.mapping[1] === 'start' && parse.auto.mapping[2] === 'title', parse.auto.mapping);
  ok('行1 可导入（周一 08:00 高数）', parse.items[0].ok && parse.items[0].days[0] === 1 && parse.items[0].start === '08:00' && parse.items[0].title === '高数', parse.items[0]);
  ok('行2 多星期展开', parse.items[1].ok && parse.items[1].days.length === 2, parse.items[1]);
  ok('行2 带时间 14:00', parse.items[1].start === '14:00' && parse.items[1].ok, parse.items[1]);
  ok('无时间行（周六自习）start 为空仍可导入', parse.items[2].start === null && parse.items[2].ok, parse.items[2]);

  // ---------- 4) 表格导入：界面全流程 ----------
  const ui = await page.evaluate(() => {
    const r = {};
    localStorage.setItem('lifeos_schedule', '[]');
    openTableImportModal();
    r.modalOpen = !document.getElementById('table-import-modal').hidden;
    document.getElementById('timport-paste').value = '星期\t时间\t课程\t地点\n周一\t08:00-09:40\t高数\t教一101\n周三,周五\t14:00\t英语\n周八\t99:99\t坏行';
    document.getElementById('timport-parse-btn').click();
    r.previewShown = !document.getElementById('timport-preview').hidden;
    r.summary = document.getElementById('timport-summary').textContent;
    r.badRowDisabled = !!document.querySelector('.timport-row--bad .timport-check[disabled]');
    const checks = document.querySelectorAll('.timport-check:not([disabled])');
    r.checkCount = checks.length;
    checks.forEach(cb => { cb.checked = true; });
    document.getElementById('timport-apply-btn').click();
    r.modalClosed = document.getElementById('table-import-modal').hidden;
    const schedule = loadSchedule();
    r.scheduleLen = schedule.length;
    r.sample = schedule[0];
    r.weeklyOk = schedule.every(s => s.repeat === 'weekly' && s.days.length === 1);
    return r;
  });
  ok('导入弹窗打开', ui.modalOpen);
  ok('粘贴解析出预览', ui.previewShown, ui.summary);
  ok('坏行（周八）自动禁用', ui.badRowDisabled);
  ok('勾选 2 行导入成功', ui.modalClosed && ui.scheduleLen === 3, ui); // 周一1 + 周三/周五2
  ok('落库为每周重复日程', ui.weeklyOk, ui.scheduleLen);
  ok('首条内容正确', ui.sample && ui.sample.title === '高数（教一101）' && ui.sample.time === '08:00' && ui.sample.endTime === '09:40', ui.sample);

  // ---------- 5) 引擎文件就位（SheetJS / Tesseract / 语言包） ----------
  const files = await page.evaluate(async () => {
    const out = {};
    for (const f of ['js/vendor/xlsx.full.min.js', 'js/vendor/tesseract.min.js', 'js/vendor/tesseract-worker.min.js', 'js/vendor/tesseract-core-simd-lstm.wasm.js', 'js/vendor/chi_sim.traineddata.gz']) {
      try { const resp = await fetch(f, { method: 'HEAD' }); out[f] = resp.ok; }
      catch (e) { out[f] = false; }
    }
    return out;
  });
  Object.keys(files).forEach(f => ok('文件可访问 ' + f, files[f]));

  // ---------- 6) SheetJS / Tesseract 加载 ----------
  const libs = await page.evaluate(async () => {
    const r = {};
    try { await loadScriptOnce('js/vendor/xlsx.full.min.js'); r.xlsx = typeof XLSX !== 'undefined'; }
    catch (e) { r.xlsx = false; }
    try { await loadScriptOnce('js/vendor/tesseract.min.js'); r.tesseract = typeof Tesseract !== 'undefined' && typeof Tesseract.createWorker === 'function'; }
    catch (e) { r.tesseract = false; }
    return r;
  });
  ok('SheetJS 加载成功', libs.xlsx);
  ok('Tesseract.js 加载成功', libs.tesseract);

  // ---------- 7) PWA ----------
  const pwa = await page.evaluate(async () => ({
    manifest: !!document.querySelector('link[rel="manifest"]'),
    themeColor: !!document.querySelector('meta[name="theme-color"]')
  }));
  ok('manifest 已挂载', pwa.manifest);
  ok('theme-color 已挂载', pwa.themeColor);
  await new Promise(r => setTimeout(r, 2500));
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  });
  ok('service worker 在 localhost 注册成功', sw);

  // ---------- 8) 结束时无报错 ----------
  ok('结束时无 JS 报错', errors.length === 0, errors);

  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本崩了：', e); process.exit(1); });
