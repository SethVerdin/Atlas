import { useLayoutEffect } from 'react';

/**
 * Grows the <textarea> with id `id` to fit `value`, up to `maxHeight` (then it scrolls).
 * Browsers keep a textarea at a fixed number of rows, so it is measured after each change.
 */
export function useAutoGrow(id: string, value: string, maxHeight: number) {
  useLayoutEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.height = 'auto'; // shrink first, so deleting text makes it smaller again
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [id, value, maxHeight]);
}
