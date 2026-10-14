import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '@/components/ui/Toast';

/**
 * App-wide toast, so feedback does not have to be an Alert.
 *
 * Most Alert.alert calls in this app were not questions — they were "Saved", "Error",
 * "Quantity must be greater than 0". A modal that must be dismissed before the user can
 * act on what it says is the wrong shape for that: it interrupts, it hides the field
 * that is wrong, and on a counter you are tapping through it without reading.
 *
 * Screens that already own a local <Toast/> keep working unchanged; this is for the
 * ones that were reaching for Alert.
 *
 * Alerts that ask a real question — "delete this, it cannot be undone" — are NOT
 * replaced by this. A destructive action should block until the user answers.
 */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const timer = useRef(null);

  const show = useCallback((message, type = 'info', title = '') => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    setToast({ visible: true, message: String(message), type, title });
  }, []);

  const hide = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);

  const api = useRef({}).current;
  api.show = show;
  api.hide = hide;
  api.success = useCallback((message, title = 'Done') => show(message, 'success', title), [show]);
  api.error = useCallback((message, title = 'Error') => show(message, 'error', title), [show]);
  api.warning = useCallback((message, title = '') => show(message, 'warning', title), [show]);
  api.info = useCallback((message, title = '') => show(message, 'info', title), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onHide={hide}
      />
    </ToastContext.Provider>
  );
}

/**
 * Returns { show, success, error, warning, info, hide }.
 * Safe to call outside the provider — falls back to no-ops rather than throwing, so a
 * screen rendered in isolation (or a test) does not crash on a toast call.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  const noop = useRef({
    show: () => {}, hide: () => {},
    success: () => {}, error: () => {}, warning: () => {}, info: () => {},
  }).current;
  return ctx || noop;
}

export default ToastContext;
