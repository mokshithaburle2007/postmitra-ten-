// Browser end-to-end test: applicant (phone) <-> admin (desktop) against a real server.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = 4100, BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
const shots = path.resolve(__dirname, '../shots');
let pass = 0, fail = 0;
const ok = (name, c, extra = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}${c ? '' : ' ' + extra}`); };

(async () => {
  const srv = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, DATA_FILE: path.join(tmp, 'db.json'), ADMIN_PASSWORD: 'staff-pass', TOKEN_SECRET: 'e2e' }, cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const errors = [];
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${who}: ${m.text()}`)); };
  const phoneCtx = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const signIn = async (p, phone, pin) => { await p.fill('#a-phone', phone); await p.fill('#a-pin', pin); await p.click('form button.btn.primary'); };

  const userCtx = await phoneCtx();
  const user = await userCtx.newPage(); watch(user, 'user');
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const admin = await adminCtx.newPage(); watch(admin, 'admin');

  try {
    console.log('Sign-in gate and account creation');
    await user.goto(`${BASE}/#/apply`);
    await user.waitForSelector('#a-phone');
    ok('apply page asks for sign-in first (no form visible)', (await user.locator('#f-scheme').count()) === 0);
    await user.screenshot({ path: `${shots}/12-user-signin.png`, fullPage: true });
    await user.click('.langs button:has-text("తె")');
    ok('sign-in is translated (Telugu)', (await user.locator('h2').first().innerText()).includes('సైన్ ఇన్'));
    await user.click('.langs button:has-text("हिं")');
    ok('sign-in is translated (Hindi)', (await user.locator('h2').first().innerText()).includes('साइन इन'));
    await user.click('.langs button:has-text("EN")');

    await user.click('.seg button:has-text("Create account")');
    await user.fill('#a-name', 'Lakshmi Devi'); await user.fill('#a-phone', '98765 43210');
    await user.fill('#a-pin', '1234'); await user.fill('#a-pin2', '1234');
    await user.click('form button.btn.primary');
    await user.waitForSelector('.err:has-text("too easy")');
    ok('easy PIN 1234 is refused', true);
    await user.fill('#a-pin', '4829'); await user.fill('#a-pin2', '4828');
    await user.click('form button.btn.primary');
    await user.waitForSelector('.err:has-text("do not match")');
    ok('mismatched PINs are refused', true);
    await user.fill('#a-pin2', '4829');
    await user.screenshot({ path: `${shots}/13-user-register.png`, fullPage: true });
    await user.click('form button.btn.primary');
    await user.waitForSelector('#f-scheme', { state: 'attached' });
    ok('account created; application form appears', true);
    ok('mobile number is prefilled and read-only', (await user.inputValue('#f-phone')) === '9876543210' && (await user.locator('#f-phone').getAttribute('readonly')) !== null);
    ok('name is prefilled from the account', (await user.inputValue('#f-applicantName')) === 'Lakshmi Devi');
    ok('header shows Account tab once signed in', await user.locator('.tabs a:has-text("Account")').isVisible());

    console.log('Applicant applies');
    await user.waitForSelector('#f-scheme option:nth-child(14)', { state: 'attached' });
    await user.selectOption('#f-scheme', 'ssy');
    await user.fill('#f-dob', '1990-05-14');
    await user.fill('#f-village', 'R. Bheemavaram'); await user.fill('#f-district', 'Anakapalli');
    await user.fill('#f-depositAmount', '5000'); await user.fill('#f-nomineeName', 'Ravi'); await user.fill('#f-nomineeRelation', 'Husband');
    await user.click('label.check:has-text("Aadhaar card")'); await user.click('label.check:has-text("Passport photo")');
    await user.fill('#f-note', 'Please call after 5pm');
    await user.click('#f-consent'); await user.click('button.btn.primary');
    await user.waitForSelector('.big-id');
    const appId = (await user.locator('.big-id').innerText()).trim();
    ok('application id issued', /^PM-\d{4}-0001$/.test(appId), appId);
    await user.screenshot({ path: `${shots}/3-user-success.png`, fullPage: true });

    console.log('Admin receives it');
    await admin.goto(`${BASE}/#/admin`);
    await admin.fill('#pw', 'wrong'); await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector('.banner-err:has-text("Wrong password")');
    ok('wrong admin password rejected', true);
    await admin.fill('#pw', 'staff-pass'); await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector('.appitem');
    ok('request visible in dashboard', (await admin.locator('.appitem').first().innerText()).includes('Lakshmi Devi'));
    ok('unread dot shown', (await admin.locator('.appitem .dot').count()) === 1);
    await admin.click('.appitem');
    await admin.waitForSelector('.detail h2:has-text("Lakshmi Devi")');
    const dt = await admin.locator('.detail').innerText();
    ok('detail shows phone from account + nominee + note', dt.includes('9876543210') && dt.includes('Ravi') && dt.includes('call after 5pm'));

    console.log('Admin responds');
    await admin.selectOption('#st', 'docs_needed');
    await admin.click('button:has-text("Save and notify applicant")');
    await admin.waitForSelector('.banner-err:has-text("Add a note")');
    ok('docs_needed without note is blocked', true);
    await admin.fill('#sn', 'Bring daughter birth certificate');
    await admin.click('button:has-text("Save and notify applicant")');
    await admin.waitForSelector('.detail .chip:has-text("Docs needed")');
    await admin.fill('textarea[placeholder="Reply to applicant"]', 'Namaste, please bring the original birth certificate.');
    await admin.click('.composer button:has-text("Send")');
    await admin.waitForSelector('.bubble.mine:has-text("birth certificate")');
    await admin.fill('input[placeholder="Add a private note"]', 'Daughter is 4 years old');
    await admin.click('button:has-text("Add")');
    await admin.waitForSelector('.inote');
    ok('status, reply and private note saved', true);

    console.log('Applicant receives (live poll, no reload) and replies');
    await user.click('button:has-text("View status")');
    await user.waitForSelector('.detail-head');
    await user.waitForSelector('.bubble.theirs:has-text("birth certificate")', { timeout: 14000 });
    ok('admin message arrives live', true);
    const ud = await user.locator('section.card').innerText();
    ok('status note shown; private note NOT visible', ud.includes('Bring daughter birth certificate') && !ud.includes('4 years old'));
    await user.screenshot({ path: `${shots}/5-user-detail.png`, fullPage: true });
    await user.fill('textarea[placeholder="Write your message"]', 'Will bring it tomorrow morning');
    await user.click('.composer button:has-text("Send")');
    await user.waitForSelector('.bubble.mine:has-text("tomorrow morning")');
    await admin.waitForSelector('.detail .bubble.theirs:has-text("tomorrow morning")', { timeout: 12000 });
    ok('applicant reply arrives in admin detail (live)', true);

    console.log('Appointment');
    await admin.selectOption('#st', 'appointment_confirmed');
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await admin.fill('#ad', d); await admin.fill('#at', '11:30'); await admin.fill('#ap', 'R. Bheemavaram SO'); await admin.fill('#sn', 'See you then');
    await admin.click('button:has-text("Save and notify applicant")');
    await admin.waitForSelector('.detail .chip:has-text("Visit confirmed")');
    await user.waitForSelector('.visit', { timeout: 14000 });
    ok('applicant sees confirmed visit', (await user.locator('.visit').innerText()).includes('11:30'));

    console.log('Second device: same account, nothing to look up');
    const ctx2 = await phoneCtx(); const p2 = await ctx2.newPage(); watch(p2, 'device2');
    await p2.goto(`${BASE}/#/track`); await p2.waitForSelector('#a-phone');
    await signIn(p2, '9876543210', '0001');
    await p2.waitForSelector('.banner-err');
    ok('wrong PIN rejected with a clear message', (await p2.locator('.banner-err').innerText()).includes('Wrong mobile number or PIN'));
    await signIn(p2, '9876543210', '4829');
    await p2.waitForSelector('.applist .appitem');
    ok('second phone shows the same application after sign-in', (await p2.locator('.applist .appitem').innerText()).includes('Sukanya'));
    await ctx2.close();

    console.log('Another applicant cannot see it');
    const ctx3 = await phoneCtx(); const p3 = await ctx3.newPage(); watch(p3, 'applicant2');
    await p3.goto(`${BASE}/#/track`); await p3.waitForSelector('#a-phone');
    await p3.click('.seg button:has-text("Create account")');
    await p3.fill('#a-name', 'Appala Naidu'); await p3.fill('#a-phone', '9123456780'); await p3.fill('#a-pin', '7391'); await p3.fill('#a-pin2', '7391');
    await p3.click('form button.btn.primary');
    await p3.waitForSelector('text=You have not applied yet.');
    ok("second applicant's list is empty (cannot see Lakshmi's application)", true);
    await p3.goto(`${BASE}/#/track/${appId}`);
    await p3.waitForSelector('.banner-err', { timeout: 8000 });
    ok("opening Lakshmi's application id directly shows an error, not data", !(await p3.locator('body').innerText()).includes('Sukanya'));
    await ctx3.close();

    console.log('Forgotten PIN: staff reset, applicant signed out, forced new PIN');
    admin.once('dialog', (dlg) => dlg.accept());
    await admin.click('button:has-text("Reset applicant")');
    await admin.waitForSelector('.notice .big-id');
    const temp = (await admin.locator('.notice .big-id').innerText()).trim();
    ok('staff see a 4-digit temporary PIN', /^\d{4}$/.test(temp), temp);
    await admin.screenshot({ path: `${shots}/14-admin-reset-pin.png` });
    await user.waitForSelector('#a-phone', { timeout: 14000 });
    ok("applicant's phone is signed out automatically after the reset", true);
    await signIn(user, '9876543210', '4829');
    await user.waitForSelector('.banner-err');
    ok('old PIN no longer works', true);
    await signIn(user, '9876543210', temp);
    await user.waitForSelector('#c-new');
    ok('temporary PIN works but forces choosing a new PIN', (await user.locator('.notice').innerText()).includes('reset your PIN'));
    await user.screenshot({ path: `${shots}/15-user-forced-change.png`, fullPage: true });
    await user.fill('#c-old', temp); await user.fill('#c-new', '6284'); await user.fill('#c-new2', '6284');
    await user.click('form button.btn.primary');
    await user.waitForSelector('.applist .appitem, .detail-head', { timeout: 8000 });
    ok('new PIN set; applicant is back in with their application', true);

    console.log('Cancel flow');
    if (await user.locator('.applist .appitem').count()) await user.click('.applist .appitem');
    await user.waitForSelector('.detail-head');
    user.once('dialog', (dlg) => dlg.accept());
    await user.click('button:has-text("Cancel application")');
    await user.waitForSelector('.detail-head .chip:has-text("Cancelled")');
    ok('applicant cancels their application', (await user.locator('.composer').count()) === 0);
    await admin.waitForSelector('.detail .chip:has-text("Cancelled")', { timeout: 12000 });
    ok('admin sees the cancellation live', true);

    console.log('Account page + lockout');
    await user.click('.tabs a:has-text("Account")');
    await user.waitForSelector('h2:has-text("My account")');
    ok('account page shows name and number', (await user.locator('section.card').first().innerText()).includes('Lakshmi Devi'));
    await user.screenshot({ path: `${shots}/16-user-account.png`, fullPage: true });
    await user.click('button:has-text("Sign out")');
    await user.waitForSelector('#a-phone');
    for (let i = 0; i < 5; i++) { await signIn(user, '9876543210', '0002'); await user.waitForSelector('.banner-err'); }
    await signIn(user, '9876543210', '6284');
    await user.waitForSelector('.banner-err:has-text("locked")');
    ok('5 wrong PINs lock the account (even the right PIN is refused)', true);

    console.log('Admin search');
    await admin.fill('input[type=search]', 'zzzz');
    await admin.waitForSelector('text=No applications match.');
    await admin.fill('input[type=search]', '9876');
    await admin.waitForSelector('.appitem');
    ok('admin search: no match, then match by phone', true);

    console.log('Mobile layouts');
    const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await m.newPage(); watch(mp, 'mobile-admin');
    await mp.goto(`${BASE}/#/admin`); await mp.fill('#pw', 'staff-pass'); await mp.click('button:has-text("Sign in")');
    await mp.waitForSelector('.appitem'); await mp.click('.appitem'); await mp.waitForSelector('.detail h2');
    ok('mobile admin detail has no horizontal scroll', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await mp.screenshot({ path: `${shots}/9-admin-mobile-detail.png`, fullPage: true });
    ok('applicant phone page has no horizontal scroll', await user.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await m.close();

    ok('no browser console/page errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    fail++; console.log('  FAIL exception:', e.message.split('\n')[0]);
    await user.screenshot({ path: `${shots}/fail-user.png`, fullPage: true }).catch(() => {});
    await admin.screenshot({ path: `${shots}/fail-admin.png`, fullPage: true }).catch(() => {});
    if (errors.length) console.log('  console errors:', errors.slice(0, 5));
  }
  await browser.close(); srv.kill();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
