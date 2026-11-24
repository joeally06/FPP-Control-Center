'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createFeedbackStore, shouldWarnBeforeUnload, type ConfirmOptions, type ConfirmRequest, type FeedbackStore, type Toast } from '@/lib/admin-feedback';
import { accentButton, button, dangerButton } from './ui-classes';

// The admin screens' replacement for the browser's confirm() and alert(), drawn like the "Stop the show now?"
// dialog and the message at the bottom of the Show page. AdminLayout mounts the provider once.

const FeedbackContext = createContext<FeedbackStore | null>(null);

/** The question on screen: focus starts on the safe button, Escape and a tap outside cancel, Tab stays inside */
export function ConfirmDialogView({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (answer: boolean) => void }) {
  const titleId = useId();
  const textId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Only the question closes: the menu drawer listens for Escape too (on window, which this runs before)
        event.stopPropagation();
        onAnswer(false);
      } else if (event.key === 'Tab') {
        // Two buttons: wrap around instead of leaving the dialog
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        } else if (document.activeElement !== first && document.activeElement !== last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.(); // back to what opened the question
    };
  }, [request.id, onAnswer]);

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => {
        // A tap outside the box cancels; it never confirms
        if (event.target === event.currentTarget) onAnswer(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.text ? textId : undefined}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-adm-control-line bg-adm-surface p-5.5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-adm-text">{request.title}</h2>
        {request.text && (
          <p id={textId} className="mt-2 whitespace-pre-line text-sm leading-relaxed text-adm-muted">{request.text}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <button ref={cancelRef} type="button" onClick={() => onAnswer(false)} className={button}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={confirmRef} type="button" onClick={() => onAnswer(true)} className={request.danger ? dangerButton : accentButton}>
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Messages at the bottom of the screen: a success is a quiet status that goes away; an error is an alert that stays until dismissed */
export function ToastStackView({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-70 mx-auto flex max-w-sm flex-col gap-2 lg:bottom-6">
      {toasts.map((toast) =>
        toast.kind === 'success' ? (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto rounded-xl bg-adm-text px-4 py-3 text-center text-sm font-medium text-adm-bg shadow-xl"
          >
            {toast.text}
          </div>
        ) : (
          <div
            key={toast.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-adm-danger-line bg-adm-danger-bg px-4 py-3 text-sm font-medium text-adm-danger shadow-xl"
          >
            <span className="min-w-0 flex-1 whitespace-pre-line wrap-break-word">{toast.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss message"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-adm-danger-line/40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      )}
    </div>
  );
}

function FeedbackHost({ store }: { store: FeedbackStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return (
    <>
      {state.confirm && <ConfirmDialogView request={state.confirm} onAnswer={store.answer} />}
      <ToastStackView toasts={state.toasts} onDismiss={store.dismiss} />
    </>
  );
}

export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createFeedbackStore());
  return (
    <FeedbackContext.Provider value={store}>
      {children}
      <FeedbackHost store={store} />
    </FeedbackContext.Provider>
  );
}

const nativeText = (options: ConfirmOptions) => [options.title, options.text].filter(Boolean).join('\n\n');

/** `if (!(await confirm({ title, text, confirmLabel, danger }))) return;` Falls back to the browser's confirm() outside the admin layout. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const store = useContext(FeedbackContext);
  return useCallback(
    (options: ConfirmOptions) => (store ? store.ask(options) : Promise.resolve(window.confirm(nativeText(options)))),
    [store]
  );
}

/** `notify('success', 'Saved')` or `notify('error', message)`. Falls back to the browser's alert() outside the admin layout. */
export function useNotify(): (kind: Toast['kind'], text: string) => void {
  const store = useContext(FeedbackContext);
  return useCallback(
    (kind: Toast['kind'], text: string) => {
      if (store) store.notify(kind, text);
      else window.alert(text);
    },
    [store]
  );
}

/** Tell the admin shell this page has unsaved edits: the browser warns before the tab closes, and the menu asks before leaving */
export function useUnsavedChanges(dirty: boolean) {
  const store = useContext(FeedbackContext);

  useEffect(() => {
    store?.setDirty(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      // They already chose Leave in our own question: don't make the browser ask again
      if (store && !shouldWarnBeforeUnload(store.getState())) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [store, dirty]);

  // Leaving the page forgets its edits
  useEffect(() => () => store?.setDirty(false), [store]);
}

/**
 * For menu links. `guardLink(href, onProceed)` goes on a Link as `onNavigate`: with nothing unsaved the move goes ahead
 * untouched; with unsaved edits it is cancelled at once and the visitor is asked, and only if they choose Leave does
 * `onProceed` run (e.g. close the drawer) and the page change. `hasUnsaved()` lets a click handler skip work that
 * should wait for that answer. (Next calls onNavigate for client-side moves only, so ctrl/cmd-click is not interrupted.)
 */
export function useNavigationGuard() {
  const store = useContext(FeedbackContext);
  const router = useRouter();
  const guardLink = useCallback(
    (href: string, onProceed?: () => void) => (event: { preventDefault: () => void }) => {
      if (!store || !store.getState().dirty) return;
      event.preventDefault();
      void store.guardNavigation().then((leave) => {
        if (!leave) return;
        onProceed?.();
        router.push(href);
      });
    },
    [store, router]
  );
  const hasUnsaved = useCallback(() => !!store?.getState().dirty, [store]);
  return { guardLink, hasUnsaved };
}

/**
 * For leaving by code (signing out): `await leaveThen(() => signOut(...))`. Asks first when edits are unsaved, and once the
 * visitor has chosen Leave the browser's own warning is switched off for the move; if `go` fails it is switched back on.
 */
export function useLeave(): (go: () => void | Promise<unknown>) => Promise<void> {
  const store = useContext(FeedbackContext);
  return useCallback(
    async (go: () => void | Promise<unknown>) => {
      if (!store) {
        await go();
        return;
      }
      if (!(await store.guardNavigation())) return;
      store.setLeaving(true);
      try {
        await go();
      } catch (error) {
        store.setLeaving(false);
        throw error;
      }
    },
    [store]
  );
}
