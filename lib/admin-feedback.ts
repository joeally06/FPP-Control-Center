// The admin screens' own versions of confirm(), alert() and "you have unsaved changes".
// Plain TypeScript with no React, so it can be tested directly; components/admin/AdminFeedback.tsx draws it.

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The confirm button looks dangerous (deleting, stopping, resetting) */
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
}

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

export interface FeedbackState {
  /** The question on screen now, if any */
  confirm: ConfirmRequest | null;
  toasts: Toast[];
  /** The page has edits that are not saved yet */
  dirty: boolean;
  /** The visitor already chose to leave, so the browser's own "leave site?" warning must not ask a second time */
  leaving: boolean;
}

/** A success message goes away by itself after this long; an error stays until it is dismissed */
export const SUCCESS_TOAST_MS = 4000;
export const MAX_TOASTS = 3;

interface Timers {
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

const realTimers: Timers = {
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const LEAVE_PAGE_QUESTION: ConfirmOptions = {
  title: 'Leave without saving?',
  text: 'You have unsaved changes on this page. They will be lost if you leave.',
  confirmLabel: 'Leave page',
  cancelLabel: 'Keep editing',
  danger: true,
};

/** Should the browser's own "leave site?" warning appear? Only for unsaved edits the visitor has not already agreed to leave. */
export function shouldWarnBeforeUnload(state: Pick<FeedbackState, 'dirty' | 'leaving'>): boolean {
  return state.dirty && !state.leaving;
}

export function createFeedbackStore(timers: Partial<Timers> = {}) {
  const { schedule, cancel } = { ...realTimers, ...timers };

  let state: FeedbackState = { confirm: null, toasts: [], dirty: false, leaving: false };
  const listeners = new Set<() => void>();
  let nextId = 1;

  const waiting: Array<{ request: ConfirmRequest; resolve: (answer: boolean) => void }> = [];
  const toastTimers = new Map<number, unknown>();
  let leaveQuestion: Promise<boolean> | null = null;

  /** The state is replaced, never changed in place, so subscribers can compare snapshots */
  function set(next: Partial<FeedbackState>) {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  }

  function showNextQuestion() {
    set({ confirm: waiting[0]?.request ?? null });
  }

  function dropToast(id: number) {
    const handle = toastTimers.get(id);
    if (handle !== undefined) cancel(handle);
    toastTimers.delete(id);
  }

  /** Ask a yes/no question. Resolves true for the confirm button, false for cancel, Escape or a tap outside. */
  function ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      waiting.push({ request: { ...options, id: nextId++ }, resolve });
      if (waiting.length === 1) showNextQuestion();
    });
  }

  /** The answer to the question on screen; ignored when nothing is open */
  function answer(value: boolean) {
    const current = waiting.shift();
    if (!current) return;
    current.resolve(value);
    showNextQuestion();
  }

  function dismiss(id: number) {
    dropToast(id);
    if (state.toasts.some((toast) => toast.id === id)) set({ toasts: state.toasts.filter((toast) => toast.id !== id) });
  }

  function notify(kind: Toast['kind'], text: string): number {
    const id = nextId++;
    let toasts = [...state.toasts, { id, kind, text }];
    while (toasts.length > MAX_TOASTS) {
      dropToast(toasts[0].id);
      toasts = toasts.slice(1);
    }
    set({ toasts });
    if (kind === 'success') toastTimers.set(id, schedule(() => dismiss(id), SUCCESS_TOAST_MS));
    return id;
  }

  function setDirty(dirty: boolean) {
    if (state.dirty !== dirty) set({ dirty });
  }

  function setLeaving(leaving: boolean) {
    if (state.leaving !== leaving) set({ leaving });
  }

  /** May the visitor leave this page? True at once when nothing is unsaved; otherwise they are asked (once, however many links were tapped). */
  function guardNavigation(): Promise<boolean> {
    if (!state.dirty) return Promise.resolve(true);
    if (!leaveQuestion) {
      leaveQuestion = ask(LEAVE_PAGE_QUESTION).finally(() => {
        leaveQuestion = null;
      });
    }
    return leaveQuestion;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { getState: () => state, subscribe, ask, answer, notify, dismiss, setDirty, setLeaving, guardNavigation };
}

export type FeedbackStore = ReturnType<typeof createFeedbackStore>;
