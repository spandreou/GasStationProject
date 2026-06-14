import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SIDEBAR_STORAGE_KEY = 'gasStation.scheduler.sidebarWidth';
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_DEFAULT_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 460;
const DESKTOP_RESIZE_MIN_WIDTH = 1024;

const SHELL_WIDTH_CLASSES = {
  narrow: 'max-w-[1680px]',
  normal: 'max-w-[1880px]',
  wide: 'max-w-[2000px]',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
  try {
    const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (storedValue == null || storedValue === '') return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(storedValue);
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return clamp(parsed, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readStoredShellMode() {
  return 'wide';
}

export default function useResizableLayout() {
  const mainPanelRef = useRef(null);
  const cleanupResizeRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [shellWidthMode] = useState(readStoredShellMode);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [mainPanelWidth, setMainPanelWidth] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // Layout persistence is optional; ignore blocked storage.
    }
  }, [sidebarWidth]);

  useEffect(() => () => {
    cleanupResizeRef.current?.();
  }, []);

  useEffect(() => {
    const node = mainPanelRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setMainPanelWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const updateSidebarWidth = useCallback((nextWidth) => {
    setSidebarWidth(clamp(Math.round(nextWidth), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
  }, []);

  const handleSidebarResizeStart = useCallback((event) => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < DESKTOP_RESIZE_MIN_WIDTH) return;
    if (event.button != null && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    cleanupResizeRef.current?.();

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    setIsResizingSidebar(true);

    const handlePointerMove = (moveEvent) => {
      updateSidebarWidth(startWidth + moveEvent.clientX - startX);
    };

    const stopResize = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setIsResizingSidebar(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      cleanupResizeRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    cleanupResizeRef.current = stopResize;
  }, [sidebarWidth, updateSidebarWidth]);

  const handleSidebarResizeKeyDown = useCallback((event) => {
    if (typeof window !== 'undefined' && window.innerWidth < DESKTOP_RESIZE_MIN_WIDTH) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth - 10);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth + 10);
    } else if (event.key === 'Home') {
      event.preventDefault();
      updateSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      updateSidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  }, [sidebarWidth, updateSidebarWidth]);

  const scheduleDensity = useMemo(() => {
    if (mainPanelWidth && mainPanelWidth < 900) return 'compact';
    if (mainPanelWidth > 1300) return 'roomy';
    return 'comfortable';
  }, [mainPanelWidth]);

  return {
    sidebarWidth,
    sidebarMinWidth: SIDEBAR_MIN_WIDTH,
    sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
    isResizingSidebar,
    mainPanelRef,
    mainPanelWidth,
    scheduleDensity,
    shellWidthMode,
    shellWidthClass: SHELL_WIDTH_CLASSES[shellWidthMode],
    handleSidebarResizeStart,
    handleSidebarResizeKeyDown,
  };
}
