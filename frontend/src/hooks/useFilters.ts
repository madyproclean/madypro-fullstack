import { useMemo, useState } from 'react';

export type FilterState<T> = {
  [K in keyof T]?: T[K];
};

export const useFilters = <T extends Record<string, unknown>>(data: T[]) => {
  const [filters, setFilters] = useState<FilterState<T>>({});

  const filtered = useMemo(() => {
    return data.filter((item) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        return String(item[key as keyof T]).includes(String(value));
      })
    );
  }, [data, filters]);

  return { filters, setFilters, data: filtered };
};
