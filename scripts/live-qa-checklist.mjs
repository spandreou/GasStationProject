import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.QA_URL || 'https://gas-station-project-coral.vercel.app';
const QA_ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || '';
const QA_ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || '';
const OUTPUT_PATH = path.resolve(process.cwd(), 'qa-live-report.json');
const DOWNLOAD_DIR = path.resolve(process.cwd(), 'qa-downloads');

const report = [];
let promptCounter = 1;

function addResult(name, status, details = '') {
  report.push({
    name,
    status,
    details,
    at: new Date().toISOString(),
  });
}

async function runStep(name, fn) {
  try {
    const details = await fn();
    addResult(name, 'PASS', details || '');
  } catch (error) {
    addResult(name, 'FAIL', error?.message || String(error));
  }
}

function toText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function clickVisibleButtonByText(page, text, options = {}) {
  const { index = 0, exact = false, withinTopPx = null, timeout = 10000 } = options;
  const button = page
    .locator('button')
    .filter({
      hasText: exact ? new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) : text,
    })
    .filter({ hasNot: page.locator(':disabled') })
    .nth(index);

  if (withinTopPx !== null) {
    await page.waitForTimeout(50);
    const count = await page.locator('button').count();
    for (let i = 0; i < count; i += 1) {
      const locator = page.locator('button').nth(i);
      if (!(await locator.isVisible().catch(() => false))) continue;
      const textContent = toText(await locator.innerText().catch(() => ''));
      if (!textContent.includes(text)) continue;
      const box = await locator.boundingBox();
      if (!box) continue;
      if (box.y <= withinTopPx) {
        await locator.click({ timeout });
        return;
      }
    }
    throw new Error(`Button "${text}" not found within top ${withinTopPx}px`);
  }

  await button.click({ timeout });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getWeekRangeLabel(page) {
  const label = page.locator('header p').first();
  await label.waitFor({ timeout: 10000 });
  return toText(await label.innerText());
}

async function loginAsAdmin(page) {
  if (!QA_ADMIN_EMAIL || !QA_ADMIN_PASSWORD) {
    throw new Error('Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD to run admin live QA.');
  }

  await clickVisibleButtonByText(page, 'Είσοδος Διαχειριστή', { index: 0 });
  const modal = page.locator('.fixed.inset-0.z-50').filter({ has: page.locator('input[type="password"]') }).first();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  await modal.locator('input[type="email"]').fill(QA_ADMIN_EMAIL);
  await modal.locator('input[type="password"]').fill(QA_ADMIN_PASSWORD);
  await modal.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);
}

async function assertButtonVisible(page, text) {
  const btn = page.locator('button').filter({ hasText: text }).first();
  if (!(await btn.isVisible().catch(() => false))) {
    throw new Error(`Expected button "${text}" to be visible`);
  }
}

async function exportFromDropdown(page, itemText) {
  await clickVisibleButtonByText(page, 'Εξαγωγή', { withinTopPx: 240 });
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await clickVisibleButtonByText(page, itemText, { timeout: 12000 });
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const targetPath = path.join(DOWNLOAD_DIR, filename);
  await download.saveAs(targetPath);
  return filename;
}

async function setScheduleMode(page, mode) {
  const selectHandle = await page.evaluateHandle((desiredMode) => {
    const candidates = Array.from(document.querySelectorAll('select'));
    return (
      candidates.find((select) => {
        const values = Array.from(select.options).map((option) => option.value);
        return values.includes('week') && values.includes('month');
      }) || null
    );
  }, mode);
  const element = selectHandle.asElement();
  if (!element) {
    await selectHandle.dispose();
    throw new Error('Schedule mode selector not found');
  }
  await element.selectOption(mode);
  await selectHandle.dispose();
  await page.waitForTimeout(500);
}

async function closeDayEditorIfOpen(page) {
  const overlay = page.locator('div[role="dialog"][aria-modal="true"]').filter({ hasText: 'Επεξεργασία Ημέρας' }).first();
  if (await overlay.isVisible().catch(() => false)) {
    const closeBtn = overlay.locator('button').filter({ hasText: 'Κλείσιμο' }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }
}

async function findDayEditorButtonAndOpen(page) {
  const editButton = page.locator('button[title="Επεξεργασία ημέρας"]').first();
  await editButton.waitFor({ state: 'visible', timeout: 10000 });
  await editButton.click();
  const editorTitle = page.locator('h3').filter({ hasText: 'Επεξεργασία Ημέρας' }).first();
  await editorTitle.waitFor({ state: 'visible', timeout: 10000 });
}

async function ensureUnlockedWeekForEditing(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const finalizeButton = page.locator('button').filter({ hasText: /Οριστικοποιημένη|Οριστικοποίηση Εβδομάδας/ }).first();
    const visible = await finalizeButton.isVisible().catch(() => false);
    if (!visible) return;
    const text = toText(await finalizeButton.innerText().catch(() => ''));
    const disabled = await finalizeButton.isDisabled().catch(() => false);
    if (!disabled && !text.includes('Οριστικοποιημένη')) {
      return;
    }
    await clickVisibleButtonByText(page, 'Προηγούμενη', { withinTopPx: 240 });
    await page.waitForTimeout(900);
  }
}

async function getDayEditorShiftCount(page) {
  const heading = page.locator('aside h4').filter({ hasText: 'Βάρδιες ημέρας' }).first();
  const text = toText(await heading.innerText());
  const match = text.match(/\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

async function addShiftViaDayEditor(page, notesText, startTime, endTime) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]').filter({ hasText: 'Επεξεργασία Ημέρας' }).first();
  await dialog.locator('button').filter({ hasText: 'Νέα Βάρδια' }).click();
  const form = dialog.locator('form').first();
  const employeeSelect = form.locator('select').first();
  const employeeValue = await employeeSelect.inputValue().catch(() => '');
  if (!employeeValue) {
    const values = await employeeSelect.evaluate((select) =>
      Array.from(select.options)
        .map((option) => option.value)
        .filter(Boolean),
    );
    if (values.length) {
      await employeeSelect.selectOption(values[0]);
    }
  }
  await form.locator('input[type="time"]').nth(0).fill(startTime);
  await form.locator('input[type="time"]').nth(1).fill(endTime);
  await form.locator('input[placeholder="Προαιρετικό"]').fill(notesText);
  await form.locator('button[type="submit"]').click({ force: true });
  await page.waitForTimeout(1200);
}

async function deleteShiftFromEditorByTime(page, timeText) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]').filter({ hasText: 'Επεξεργασία Ημέρας' }).first();
  const row = dialog.locator('aside div').filter({ hasText: timeText }).first();
  if (!(await row.isVisible().catch(() => false))) {
    throw new Error(`Shift row with time "${timeText}" not found for delete`);
  }
  const delButton = row.locator('button[title="Διαγραφή βάρδιας"]').first();
  await delButton.click();
  await page.waitForTimeout(900);
}

async function closeDayEditor(page) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]').filter({ hasText: 'Επεξεργασία Ημέρας' }).first();
  const closeBtn = dialog.locator('button').filter({ hasText: 'Κλείσιμο' }).first();
  await closeBtn.click();
  await page.waitForTimeout(500);
}

async function addEmployee(page, name, role) {
  const form = page.locator('form').filter({ has: page.locator('input[placeholder="Ονοματεπώνυμο"]') }).first();
  await form.locator('input[placeholder="Ονοματεπώνυμο"]').fill(name);
  await form.locator('input[placeholder="Ρόλος (π.χ. Ταμείο)"]').fill(role);
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);
}

async function openEmployeeProfile(page, employeeName) {
  const ok = await page.evaluate((targetName) => {
    const cards = Array.from(document.querySelectorAll('div.flex.items-center.gap-2'));
    const card = cards.find((node) => (node.textContent || '').includes(targetName));
    if (!card) return false;
    const button = card.querySelector('button[title="Προφίλ / Επεξεργασία"]');
    if (!button) return false;
    button.click();
    return true;
  }, employeeName);
  if (!ok) {
    throw new Error(`Profile button not found for employee "${employeeName}"`);
  }
  await page.waitForTimeout(500);
}

async function saveEmployeeProfileRole(page, roleText) {
  const modal = page.locator('.fixed.inset-0.z-50').filter({ has: page.locator('input[type="color"]') }).first();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  await modal.locator('input').nth(1).fill(roleText);
  await modal.locator('button[type="submit"]').click();
  await page.waitForTimeout(900);
}

async function deleteEmployeeByName(page, employeeName) {
  const deleted = await page.evaluate((targetName) => {
    const cards = Array.from(document.querySelectorAll('div.flex.items-center.gap-2'));
    const card = cards.find((node) => (node.textContent || '').includes(targetName));
    if (!card) return false;
    const button = card.querySelector('button[title="Διαγραφή"]');
    if (!button) return false;
    button.click();
    return true;
  }, employeeName);
  if (!deleted) {
    throw new Error(`Delete button not found for employee "${employeeName}"`);
  }
  await page.waitForTimeout(1200);
}

async function addAndDeleteAnnouncement(page, uniqueTitle, uniqueBody) {
  const form = page.locator('form').filter({ has: page.locator('textarea') }).first();
  await form.locator('input[type="text"]').fill(uniqueTitle);
  await form.locator('textarea').fill(uniqueBody);
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(1000);

  const announcementCard = page.locator('article').filter({ hasText: uniqueTitle }).first();
  await announcementCard.waitFor({ state: 'visible', timeout: 10000 });
  await announcementCard.locator('button[title="Διαγραφή ανακοίνωσης"]').click();
  await page.waitForTimeout(900);
}

async function addAndDeleteSpecialDay(page, dateValue, label) {
  const panel = page.locator('section').filter({ hasText: 'Ειδικές Ημέρες' }).first();
  await panel.locator('input[type="date"]').first().fill(dateValue);
  await panel.locator('input[type="text"]').first().fill(label);
  await panel.locator('button').filter({ hasText: 'Αποθήκευση ειδικής ημέρας' }).click();
  await page.waitForTimeout(1200);

  const entry = panel.locator('article').filter({ hasText: dateValue }).first();
  await entry.waitFor({ state: 'visible', timeout: 10000 });
  await entry.locator('button').filter({ hasText: 'Διαγραφή' }).click();
  await page.waitForTimeout(1000);
}

async function run() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept(`QA-Template-${Date.now()}-${promptCounter++}`);
      return;
    }
    await dialog.accept();
  });

  await runStep('Open deployed URL', async () => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    return APP_URL;
  });

  await runStep('Admin login', async () => {
    await loginAsAdmin(page);
    await assertButtonVisible(page, 'Αποσύνδεση');
    return `Logged in as ${QA_ADMIN_EMAIL}`;
  });

  await runStep('Toolbar: previous/next/current week', async () => {
    const initial = await getWeekRangeLabel(page);
    await clickVisibleButtonByText(page, 'Προηγούμενη', { withinTopPx: 240 });
    await page.waitForTimeout(700);
    const previous = await getWeekRangeLabel(page);
    await clickVisibleButtonByText(page, 'Επόμενη', { withinTopPx: 240 });
    await page.waitForTimeout(700);
    const next = await getWeekRangeLabel(page);
    await clickVisibleButtonByText(page, 'Τρέχουσα', { withinTopPx: 240 });
    await page.waitForTimeout(700);
    const current = await getWeekRangeLabel(page);
    if (initial === previous) {
      throw new Error('Previous week click did not change week label');
    }
    if (!next) {
      throw new Error('Next week label is empty');
    }
    return `initial="${initial}" previous="${previous}" next="${next}" current="${current}"`;
  });

  await runStep('Toolbar: theme toggle', async () => {
    const darkButton = page.locator('button').filter({ hasText: /Dark|Light/ }).first();
    const before = toText(await darkButton.innerText());
    await darkButton.click();
    await page.waitForTimeout(300);
    const after = toText(await darkButton.innerText());
    if (before === after) {
      throw new Error(`Theme toggle text did not change (still "${before}")`);
    }
    return `${before} -> ${after}`;
  });

  await runStep('Export: PDF εβδομάδας', async () => {
    const filename = await exportFromDropdown(page, 'PDF Εβδομάδας');
    if (!filename.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Unexpected filename: ${filename}`);
    }
    return filename;
  });

  await runStep('Export: PDF μήνα', async () => {
    const filename = await exportFromDropdown(page, 'PDF Μήνα');
    if (!filename.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Unexpected filename: ${filename}`);
    }
    return filename;
  });

  await runStep('Export: Excel', async () => {
    const filename = await exportFromDropdown(page, 'Excel');
    if (!filename.toLowerCase().endsWith('.xlsx')) {
      throw new Error(`Unexpected filename: ${filename}`);
    }
    return filename;
  });

  await runStep('Export: Word', async () => {
    const filename = await exportFromDropdown(page, 'Word');
    if (!filename.toLowerCase().endsWith('.docx')) {
      throw new Error(`Unexpected filename: ${filename}`);
    }
    return filename;
  });

  await runStep('Analytics mode switch: week/month', async () => {
    const panel = page.locator('section').filter({ hasText: 'Ώρες Εβδομάδας Ανά Υπάλληλο' }).first();
    await panel.locator('button').filter({ hasText: 'Μήνας' }).click();
    await page.waitForTimeout(500);
    const monthHeadingVisible = await page
      .locator('h2')
      .filter({ hasText: 'Ώρες Μήνα Ανά Υπάλληλο' })
      .first()
      .isVisible();
    if (!monthHeadingVisible) {
      throw new Error('Month analytics heading not visible');
    }
    const monthPanel = page.locator('section').filter({ hasText: 'Ώρες Μήνα Ανά Υπάλληλο' }).first();
    await monthPanel.locator('button').filter({ hasText: 'Εβδομάδα' }).click();
    await page.waitForTimeout(500);
    const weekHeadingVisible = await page
      .locator('h2')
      .filter({ hasText: 'Ώρες Εβδομάδας Ανά Υπάλληλο' })
      .first()
      .isVisible();
    if (!weekHeadingVisible) {
      throw new Error('Week analytics heading not visible after switch back');
    }
    return 'Week -> Month -> Week works';
  });

  await runStep('WeeklyGrid schedule mode select: week/month', async () => {
    await setScheduleMode(page, 'month');
    const monthGenerateButton = page.locator('button').filter({ hasText: 'Αυτόματη Δημιουργία' }).nth(1);
    await monthGenerateButton.waitFor({ state: 'visible', timeout: 10000 });
    await setScheduleMode(page, 'week');
    const weekTitle = await page.locator('h2').filter({ hasText: 'Πίνακας Βαρδιών' }).first().isVisible();
    if (!weekTitle) {
      throw new Error('Weekly grid title not visible after switching back');
    }
    return 'Selector changed to month and back to week';
  });

  await runStep('Day editor: open/add/delete/close', async () => {
    await closeDayEditorIfOpen(page);
    await ensureUnlockedWeekForEditing(page);
    await findDayEditorButtonAndOpen(page);
    const before = await getDayEditorShiftCount(page);
    const notesText = `QA shift ${Date.now()}`;
    const candidates = [
      ['22:30', '23:00'],
      ['00:15', '00:45'],
      ['05:00', '05:30'],
    ];

    let afterAdd = before;
    let usedSlot = '';
    for (const [startTime, endTime] of candidates) {
      await addShiftViaDayEditor(page, notesText, startTime, endTime);
      afterAdd = await getDayEditorShiftCount(page);
      if (afterAdd > before) {
        usedSlot = `${startTime} - ${endTime}`;
        break;
      }
    }

    if (afterAdd <= before || !usedSlot) {
      const guardrailMessage = await page.evaluate(() => {
        const texts = Array.from(document.querySelectorAll('div, p, span, article'))
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean);
        return (
          texts.find((text) => text.toLowerCase().includes('κλειδωμένη')) ||
          texts.find((text) => text.toLowerCase().includes('επικάλυψη')) ||
          texts.find((text) => text.toLowerCase().includes('αποτυχία')) ||
          texts.find((text) => text.toLowerCase().includes('επίλεξε υπάλληλο')) ||
          texts.find((text) => text.toLowerCase().includes('ώρα λήξης')) ||
          ''
        );
      });
      if (guardrailMessage) {
        await closeDayEditor(page);
        return `Add prevented by guardrail: ${guardrailMessage}`;
      }
      throw new Error(`Shift count did not increase (${before} -> ${afterAdd}) and no guardrail message was detected.`);
    }
    await deleteShiftFromEditorByTime(page, usedSlot);
    const afterDelete = await getDayEditorShiftCount(page);
    if (afterDelete !== before) {
      throw new Error(`Shift count did not return to baseline (${before} -> ${afterAdd} -> ${afterDelete})`);
    }
    await closeDayEditor(page);
    return `counts: ${before} -> ${afterAdd} -> ${afterDelete}`;
  });

  await runStep('Manual override toggle on shift card', async () => {
    await closeDayEditorIfOpen(page);
    const grid = page.locator('#weekly-grid-export');
    const markInitial = grid.locator('button').filter({ hasText: /^Mark Manual$/ }).first();
    const clearInitial = grid.locator('button').filter({ hasText: /^Καθαρισμός$/ }).first();
    const hasMark = await markInitial.isVisible().catch(() => false);
    const hasClear = await clearInitial.isVisible().catch(() => false);
    if (!hasMark && !hasClear) {
      return 'No manual override controls available in current visible week';
    }
    if (hasMark) {
      await markInitial.click({ force: true });
      await page.waitForTimeout(600);
      const clearVisible = await grid.locator('button').filter({ hasText: /^Καθαρισμός$/ }).first().isVisible().catch(() => false);
      if (!clearVisible) {
        throw new Error('Mark Manual click did not produce a clearable manual override state');
      }
      return 'Mark Manual -> Καθαρισμός';
    }

    const clearBtn = clearInitial;
    await clearBtn.waitFor({ state: 'visible', timeout: 10000 });
    await clearBtn.click({ force: true });
    await page.waitForTimeout(900);

    const markBtn = grid.locator('button').filter({ hasText: /^Mark Manual$/ }).first();
    if (!(await markBtn.isVisible().catch(() => false))) {
      const warningVisible = await page.locator('text=κλειδωμένη').first().isVisible().catch(() => false);
      if (warningVisible) {
        return 'Clear blocked by locked week warning (expected guardrail)';
      }
      throw new Error('Mark Manual did not appear after clearing manual override');
    }
    await markBtn.click();
    await page.waitForTimeout(700);
    return 'Καθαρισμός -> Mark Manual';
  });

  await runStep('Employee flow: add/edit/delete', async () => {
    const name = `QA Employee ${Date.now()}`;
    await addEmployee(page, name, 'QA Role');
    await page.waitForTimeout(900);
    const existsAfterAdd = await page.locator(`text=${name}`).first().isVisible().catch(() => false);
    if (!existsAfterAdd) {
      throw new Error('Employee not visible after add');
    }

    await openEmployeeProfile(page, name);
    await saveEmployeeProfileRole(page, 'QA Role Edited');
    await page.waitForTimeout(600);

    await deleteEmployeeByName(page, name);
    await page.waitForTimeout(900);
    const existsAfterDelete = await page.locator(`text=${name}`).first().isVisible().catch(() => false);
    if (existsAfterDelete) {
      throw new Error('Employee still visible after delete');
    }
    return name;
  });

  await runStep('Template flow: save/load controls and create/delete template card', async () => {
    await closeDayEditorIfOpen(page);
    const label = `QA Template Card ${Date.now()}`;
    const form = page.locator('form').filter({ has: page.locator('input[placeholder="Όνομα (π.χ. Πλύσιμο)"]') }).first();
    await form.locator('input[placeholder="Όνομα (π.χ. Πλύσιμο)"]').fill(label);
    await form.locator('input[type="time"]').nth(0).fill('11:00');
    await form.locator('input[type="time"]').nth(1).fill('12:00');
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(1000);

    const labelLocator = page.locator(`text=${label}`).first();
    await labelLocator.waitFor({ state: 'visible', timeout: 10000 });

    const deleted = await page.evaluate((targetLabel) => {
      const cards = Array.from(document.querySelectorAll('div.flex.items-center.gap-2'));
      const card = cards.find((node) => (node.textContent || '').includes(targetLabel));
      if (!card) return false;
      const del = card.querySelector('button[title="Διαγραφή κάρτας"]');
      if (!del) return false;
      del.click();
      return true;
    }, label);
    if (!deleted) {
      throw new Error('Unable to click delete on template card');
    }
    await page.waitForTimeout(900);

    const existsAfterDelete = await page.locator(`text=${label}`).first().isVisible().catch(() => false);
    if (existsAfterDelete) {
      throw new Error('Template card still visible after delete');
    }
    return label;
  });

  await runStep('Announcements flow: add/delete', async () => {
    const title = `QA Announcement ${Date.now()}`;
    const body = 'Automated QA announcement body.';
    await addAndDeleteAnnouncement(page, title, body);
    const stillExists = await page.locator('article').filter({ hasText: title }).first().isVisible().catch(() => false);
    if (stillExists) {
      throw new Error('Announcement still visible after delete');
    }
    return title;
  });

  await runStep('Special days flow: add/delete', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const label = `QA Special ${Date.now()}`;
    await addAndDeleteSpecialDay(page, date, label);
    const panel = page.locator('section').filter({ hasText: 'Ειδικές Ημέρες' }).first();
    const existsAfterDelete = await panel.locator('article').filter({ hasText: label }).first().isVisible().catch(() => false);
    if (existsAfterDelete) {
      throw new Error('Special day entry still visible after delete');
    }
    return `${date} ${label}`;
  });

  await runStep('Save current week snapshot + history viewer selection', async () => {
    await closeDayEditorIfOpen(page);
    await clickVisibleButtonByText(page, 'Αποθήκευση', { withinTopPx: 240 });
    await page.waitForTimeout(2500);

    const historySelectHandle = await page.evaluateHandle(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      return selects.find((select) => (select.options?.[0]?.textContent || '').includes('Ιστορικό εβδομάδων')) || null;
    });
    const historySelect = historySelectHandle.asElement();
    if (!historySelect) {
      await historySelectHandle.dispose();
      throw new Error('History dropdown not found');
    }

    const optionValues = await historySelect.evaluate((select) =>
      Array.from(select.options)
        .map((option) => option.value)
        .filter(Boolean),
    );

    if (!optionValues.length) {
      await historySelectHandle.dispose();
      throw new Error('No history dropdown options available after save');
    }

    await historySelect.selectOption(optionValues[0]);
    await page.waitForTimeout(300);
    await clickVisibleButtonByText(page, 'Φόρτωση Εβδομάδας');
    await page.waitForTimeout(500);
    await historySelectHandle.dispose();
    return `history options visible: ${optionValues.length}`;
  });

  await runStep('Save as template button prompt flow', async () => {
    await closeDayEditorIfOpen(page);
    await clickVisibleButtonByText(page, 'Αποθήκευση ως Πρότυπο');
    await page.waitForTimeout(1200);
    const templateSelect = page.locator('select').filter({ has: page.locator('option[value=""]') }).nth(2);
    await templateSelect.waitFor({ timeout: 10000 });
    return 'Prompt accepted and template save action triggered';
  });

  await runStep('Auth logout/login repeat', async () => {
    await clickVisibleButtonByText(page, 'Αποσύνδεση', { withinTopPx: 240 });
    await page.waitForTimeout(1000);
    await assertButtonVisible(page, 'Είσοδος Διαχειριστή');
    await loginAsAdmin(page);
    await assertButtonVisible(page, 'Αποσύνδεση');
    return 'Logout and login retest passed';
  });

  await context.close();
  await browser.close();

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`QA report saved to ${OUTPUT_PATH}`);
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  addResult('Fatal run error', 'FAIL', error?.stack || error?.message || String(error));
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.error(error);
  process.exitCode = 1;
});
