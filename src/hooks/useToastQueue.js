import { useCallback, useMemo, useRef, useState } from 'react';

const MAX_VISIBLE_TOASTS = 3;

function getToastSignature(type, message) {
  return `${type || 'info'}::${(message || '').trim().toLowerCase()}`;
}

export function useToastQueue({ maxVisible = MAX_VISIBLE_TOASTS } = {}) {
  const [toasts, setToasts] = useState([]);
  const sequenceRef = useRef(0);

  const dismissToast = useCallback((toastId) => {
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const pushToast = useCallback(
    ({
      type = 'info',
      message,
      title = '',
      duration = 3800,
      actionLabel = '',
      onAction,
      dedupe = true,
    }) => {
      if (!message || !String(message).trim()) return null;

      const normalizedMessage = String(message).trim();
      const signature = getToastSignature(type, normalizedMessage);

      let createdToast = null;
      setToasts((current) => {
        const hasDuplicate = dedupe
          ? current.some((item) => item.signature === signature)
          : false;
        if (hasDuplicate) return current;

        const nextToast = {
          id: `toast_${Date.now()}_${sequenceRef.current}`,
          type,
          title,
          message: normalizedMessage,
          duration,
          actionLabel,
          onAction,
          signature,
        };

        sequenceRef.current += 1;
        createdToast = nextToast;

        const nextQueue = [nextToast, ...current];
        return nextQueue.slice(0, Math.max(maxVisible * 2, maxVisible));
      });

      return createdToast;
    },
    [maxVisible],
  );

  const visibleToasts = useMemo(() => toasts.slice(0, maxVisible), [toasts, maxVisible]);

  return {
    toasts: visibleToasts,
    pushToast,
    dismissToast,
    clearToasts,
  };
}

export default useToastQueue;
