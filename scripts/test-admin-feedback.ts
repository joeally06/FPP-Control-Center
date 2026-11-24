import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFeedbackStore, MAX_TOASTS, shouldWarnBeforeUnload, SUCCESS_TOAST_MS } from '../lib/admin-feedback';
import { ConfirmDialogView, ToastStackView } from '../components/admin/AdminFeedback';

function print(msg: string) {
  console.log('[test-admin-feedback] ' + msg);
}

const root = process.cwd();
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf-8');
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const noop = () => {};

/** A store whose timers only run when the test says so */
function storeWithFakeTimers() {
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const store = createFeedbackStore({
    schedule: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    cancel: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  });
  const fire = (index: number) => {
    if (!timers[index].cleared) timers[index].fn();
  };
  return { store, timers, fire };
}

async function main() {
  print('Test 1: ask() resolves with the answer, and answers one question at a time');
  {
    const { store } = storeWithFakeTimers();
    const first = store.ask({ title: 'Delete it?' });
    const second = store.ask({ title: 'And this?' });
    assert.strictEqual(store.getState().confirm?.title, 'Delete it?', 'the first question is showing');
    store.answer(true);
    assert.strictEqual(await first, true);
    assert.strictEqual(store.getState().confirm?.title, 'And this?', 'the next one waits its turn');
    store.answer(false);
    assert.strictEqual(await second, false);
    assert.strictEqual(store.getState().confirm, null, 'nothing is left open');
    store.answer(true); // an answer with nothing open is ignored
  }

  print('Test 2: toasts: success ones expire, errors stay until dismissed, the stack is capped');
  {
    const { store, timers, fire } = storeWithFakeTimers();
    const ok = store.notify('success', 'Saved');
    const bad = store.notify('error', 'Import failed: Row 3: boom');
    assert.strictEqual(store.getState().toasts.length, 2);
    assert.strictEqual(timers.length, 1, 'only the success toast got a timer');
    assert.strictEqual(timers[0].ms, SUCCESS_TOAST_MS);
    fire(0);
    assert.deepStrictEqual(store.getState().toasts.map((t) => t.id), [bad], 'the success toast expired, the error stayed');
    store.dismiss(bad);
    assert.strictEqual(store.getState().toasts.length, 0);
    assert.notStrictEqual(ok, bad);

    for (let i = 0; i < MAX_TOASTS + 2; i++) store.notify('error', `problem ${i}`);
    const shown = store.getState().toasts;
    assert.strictEqual(shown.length, MAX_TOASTS, 'only the newest few are kept');
    assert.strictEqual(shown[shown.length - 1].text, `problem ${MAX_TOASTS + 1}`);
  }

  print('Test 3: subscribers hear about every change, and the state is a new object only when something changed');
  {
    const { store } = storeWithFakeTimers();
    let heard = 0;
    const stop = store.subscribe(() => heard++);
    const before = store.getState();
    store.setDirty(false); // already false: nothing changes
    assert.strictEqual(store.getState(), before);
    assert.strictEqual(heard, 0);
    store.setDirty(true);
    assert.notStrictEqual(store.getState(), before);
    assert.strictEqual(heard, 1);
    stop();
    store.notify('success', 'x');
    assert.strictEqual(heard, 1, 'an unsubscribed listener hears nothing more');
  }

  print('Test 4: leaving a page: nothing unsaved passes at once; unsaved edits ask first');
  {
    const { store } = storeWithFakeTimers();
    assert.strictEqual(await store.guardNavigation(), true, 'not dirty: no question');
    assert.strictEqual(store.getState().confirm, null);

    store.setDirty(true);
    const stay = store.guardNavigation();
    const request = store.getState().confirm;
    assert.ok(request, 'a question is showing');
    assert.match(request.title, /leave/i);
    assert.strictEqual(request.danger, true);
    assert.strictEqual(request.cancelLabel, 'Keep editing');
    store.answer(false);
    assert.strictEqual(await stay, false, 'Keep editing: the visit stays');

    const go = store.guardNavigation();
    store.answer(true);
    assert.strictEqual(await go, true, 'Leave: allowed');

    // Two taps on links at the same moment ask only once
    const tapOne = store.guardNavigation();
    const tapTwo = store.guardNavigation();
    store.answer(true);
    assert.deepStrictEqual([await tapOne, await tapTwo], [true, true]);
    assert.strictEqual(store.getState().confirm, null, 'only one question was asked');
  }

  print('Test 4b: once the visitor has chosen to leave, the browser does not ask a second time');
  {
    const { store } = storeWithFakeTimers();
    assert.strictEqual(shouldWarnBeforeUnload(store.getState()), false, 'nothing unsaved: no warning');
    store.setDirty(true);
    assert.strictEqual(shouldWarnBeforeUnload(store.getState()), true, 'unsaved edits: the browser warns on closing the tab');
    const before = store.getState();
    store.setLeaving(true);
    assert.notStrictEqual(store.getState(), before);
    assert.strictEqual(shouldWarnBeforeUnload(store.getState()), false, 'they chose Leave: no second warning (sign-out reloads the page)');
    const same = store.getState();
    store.setLeaving(true);
    assert.strictEqual(store.getState(), same, 'setting the same value changes nothing');
    store.setLeaving(false);
    assert.strictEqual(shouldWarnBeforeUnload(store.getState()), true, 'if leaving fails, the protection comes back');
  }

  print('Test 5: the confirm dialog is a labelled modal alert dialog with the safe choice and the danger choice');
  {
    const markup = html(createElement(ConfirmDialogView, {
      request: { id: 1, title: 'Delete "Mega tree"?', text: 'This cannot be undone.\n\nReally.', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true },
      onAnswer: noop,
    }));
    assert.ok(markup.includes('role="alertdialog"') && markup.includes('aria-modal="true"'));
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(labelledBy && markup.includes(`id="${labelledBy}"`), 'the title is the dialog label');
    assert.ok(describedBy && markup.includes(`id="${describedBy}"`), 'the text describes the dialog');
    assert.ok(markup.includes('Delete &quot;Mega tree&quot;?') && markup.includes('>Cancel<') && markup.includes('>Delete<'));
    assert.ok(markup.includes('whitespace-pre-line'), 'line breaks in the text are kept');
    assert.ok(markup.includes('max-h-[calc(100dvh-2rem)]') && markup.includes('overflow-y-auto'), 'a long text scrolls inside the screen instead of pushing the buttons off it');
    assert.ok(markup.includes('border-adm-danger-line'), 'the confirm button looks dangerous');

    const plain = html(createElement(ConfirmDialogView, { request: { id: 2, title: 'Reset it?' }, onAnswer: noop }));
    assert.ok(plain.includes('>Confirm<') && plain.includes('>Cancel<'), 'default button labels');
    assert.ok(!plain.includes('aria-describedby'), 'no description when there is no text');
  }

  print('Test 6: toasts: errors are alerts you can dismiss, successes are quiet status messages');
  {
    const markup = html(createElement(ToastStackView, {
      toasts: [{ id: 1, kind: 'success', text: 'Saved' }, { id: 2, kind: 'error', text: 'Import failed' }],
      onDismiss: noop,
    }));
    const alertAt = markup.indexOf('role="alert"');
    assert.ok(alertAt > 0, 'the error is an alert');
    const successPart = markup.slice(0, alertAt);
    assert.ok(/role="status"[^>]*>Saved</.test(successPart) && !successPart.includes('role="alert"'), 'success is a status');
    const errorPart = markup.slice(alertAt);
    assert.ok(errorPart.includes('Import failed') && errorPart.includes('aria-label="Dismiss message"'), 'an error is an alert with a Dismiss button');
    assert.strictEqual((markup.match(/aria-label="Dismiss message"/g) ?? []).length, 1, 'successes need no dismiss button');
    assert.strictEqual(html(createElement(ToastStackView, { toasts: [], onDismiss: noop })), '', 'nothing shows with no messages');
  }

  print('Test 7: no admin screen is left with a native alert() or confirm()');
  {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (rel === 'app/api') continue;
          walk(rel);
        } else if (/\.tsx$/.test(entry.name)) {
          // the visitor privacy page and the fallback inside AdminFeedback itself are the only allowed ones
          if (rel === 'app/privacy/page.tsx' || rel === 'components/admin/AdminFeedback.tsx') continue;
          if (/(^|[^.\w])(window\.)?(alert|confirm)\(/.test(read(rel))) offenders.push(rel);
        }
      }
    };
    walk('app');
    walk('components');
    assert.deepStrictEqual(offenders, [], `native alert()/confirm() still used in: ${offenders.join(', ')}`);
  }

  print('Test 8: the pieces are wired together');
  {
    // Above every page: pages like /models render <AdminLayout> themselves and call the hooks in the same component,
    // so a provider inside AdminLayout would be below the hooks and they would fall back to the browser's pop-ups
    assert.ok(read('app', 'providers.tsx').includes('<AdminFeedbackProvider>'), 'the app providers mount it');
    assert.ok(!read('components', 'AdminLayout.tsx').includes('AdminFeedbackProvider'), 'and AdminLayout does not mount a second one');
    const nav = read('components', 'AdminNavigation.tsx');
    assert.ok((nav.match(/onNavigate=/g) ?? []).length >= 2, 'sidebar and bottom-bar links ask before leaving unsaved edits');
    assert.ok(nav.includes('useNavigationGuard'), 'navigation uses the guard');
    // The drawer must stay open while the question is showing, or cancelling would put focus on a hidden link
    assert.ok(nav.includes('onNavigate={guardLink(item.href, closeDrawer)}'), 'the drawer closes only once leaving is approved');
    assert.ok(nav.includes('if (!hasUnsaved()) closeDrawer()'), 'a click closes the drawer at once only when nothing is unsaved');
    assert.ok(nav.includes('leaveThen(() => signOut('), 'sign-out goes through the same question and switches the browser warning off');
    assert.ok(read('components', 'admin', 'AdminFeedback.tsx').includes('shouldWarnBeforeUnload('), 'the browser warning consults the same rule');
    // The drawer closes on Escape through a window listener; the question must take the key so cancelling it leaves the drawer open
    assert.ok(/addEventListener\('keydown'/.test(nav) && /window\.addEventListener\('keydown'/.test(nav), 'the drawer listens for Escape on window');
    assert.ok(/key === 'Escape'\)\s*\{[\s\S]{0,200}event\.stopPropagation\(\)/.test(read('components', 'admin', 'AdminFeedback.tsx')), 'the question stops Escape from reaching the drawer');
    const display = read('components', 'admin', 'DisplaySettings.tsx');
    assert.ok(display.includes('useUnsavedChanges(dirty)'), 'Display settings registers its unsaved edits');
    assert.ok(!display.includes("addEventListener('beforeunload'"), 'and no longer has its own beforeunload copy');
    const models = read('app', 'models', 'page.tsx');
    assert.ok(/role="button"/.test(models) && /aria-expanded=/.test(models) && /onKeyDown=/.test(models), 'a model card opens from the keyboard');
  }

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
