import { useCallback, useState } from 'react';

const KEY = 'admin_expert_mode';

export function useExpertMode() {
  const [expert, setExpert] = useState(() => localStorage.getItem(KEY) === '1');

  const toggle = useCallback(() => {
    setExpert((v) => {
      const next = !v;
      localStorage.setItem(KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return { expert, toggle };
}
