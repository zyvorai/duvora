/* Run against a fresh demo server with a built console (make web).
   npm install --no-save playwright@1.63.0 && npx playwright install chromium
   PLAYWRIGHT_CHANNEL=chrome uses an installed Google Chrome instead. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');

const URL = process.env.DUVORA_URL || 'http://127.0.0.1:8787';
const USER = process.env.DUVORA_USER || 'admin';
const PASSWORD = process.env.DUVORA_PASSWORD || 'Admin@321';

async function shot(page, name) {
  // Let the mega menu close and the page fade-in finish before capturing.
  await page.mouse.move(1400, 1000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

async function menu(page, group, item) {
  await page.getByRole('button', { name: group, exact: true }).click();
  await page.getByRole('region', { name: group }).getByRole('button', { name: new RegExp('^' + item) }).click();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  // DUVORA_E2E_INSECURE_TLS=1 accepts a deployment's self-signed certificate (test runs only).
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, ignoreHTTPSErrors: process.env.DUVORA_E2E_INSECURE_TLS === '1' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/status of 401/.test(msg.text())) errors.push(msg.text());
  });
  fs.mkdirSync('test-results', { recursive: true });

  await page.goto(URL);
  await page.getByRole('heading', { name: 'Sign in.' }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await shot(page, 'login');

  await page.getByLabel('Username').fill(USER);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Wrong username or password.').waitFor();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Infrastructure, in control.' }).waitFor();
  await page.getByText('You are signed in with the default password.').waitFor();
  await page.getByText('FLEET PULSE').waitFor();
  await shot(page, 'overview');

  // The session is an HttpOnly cookie: a reload stays signed in and no key is in storage.
  await page.reload();
  await page.getByRole('heading', { name: 'Infrastructure, in control.' }).waitFor();
  assert.equal(await page.evaluate(() => document.cookie), '');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'duvora-theme').length), 0);

  await menu(page, 'Fleet', 'Devices');
  await page.getByRole('checkbox', { name: 'Select bf3-01', exact: true }).check();
  await menu(page, 'Operate', 'Isolation');
  await page.getByRole('button', { name: 'Create policy' }).click();
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.getByText('Only the local simulation model will change.').waitFor();
  await page.getByRole('button', { name: 'Apply simulation', exact: true }).click();
  await page.getByRole('heading', { name: 'Every change, accounted for.' }).waitFor();
  await page.locator('tbody tr').filter({ hasText: 'isolate' }).getByText('succeeded', { exact: true }).waitFor({ timeout: 15000 });

  await menu(page, 'Operate', 'Isolation');
  await page.locator('#eval-ip').fill('8.8.8.8');
  await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
  await page.getByText('DENY · simulation only').waitFor();

  await menu(page, 'Operate', 'Operations');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Roll back' }).first().click();
  await page.getByText('rolled-back', { exact: true }).waitFor({ timeout: 10000 });

  await menu(page, 'Fleet', 'Topology');
  await page.getByRole('img', { name: 'Fleet topology' }).waitFor();
  await shot(page, 'topology');

  await menu(page, 'Fleet', 'Telemetry');
  await page.getByRole('heading', { name: 'Device trends' }).waitFor();

  await menu(page, 'Monitor', 'Incidents');
  await page.getByText('Device health degraded on bf3-03').first().waitFor({ timeout: 15000 });
  await shot(page, 'incidents');

  await menu(page, 'Monitor', 'Alert rules');
  await page.getByRole('table', { name: 'Alert rules' }).waitFor();

  await menu(page, 'Monitor', 'Scorecard');
  await page.getByRole('heading', { name: 'How the score is built' }).waitFor();

  await menu(page, 'Monitor', 'Report');
  await page.getByRole('heading', { name: 'Shift briefing' }).waitFor();

  await menu(page, 'Govern', 'Users');
  await page.getByLabel('New username').fill('auditor');
  await page.getByLabel('New user password').fill('auditor-password');
  await page.getByRole('button', { name: 'Add user' }).click();
  await page.getByRole('table', { name: 'Users' }).getByText('auditor', { exact: true }).waitFor();
  await shot(page, 'users');

  await menu(page, 'Govern', 'Audit trail');
  await page.getByText('user.created').first().waitFor();

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await shot(page, 'audit-dark');

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('heading', { name: 'Sign in.' }).waitFor();

  // A viewer sees the console but no write controls.
  await page.getByLabel('Username').fill('auditor');
  await page.getByLabel('Password').fill('auditor-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await menu(page, 'Operate', 'Isolation');
  assert.equal(await page.getByRole('button', { name: 'Create policy' }).isDisabled(), true);

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Console workflow passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
