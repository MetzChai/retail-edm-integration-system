"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export function useFetch<T = unknown>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffline(false);
    const res = await api.get<T>(path);
    if (res.ok) {
      setData(res.data as T);
    } else {
      setError(res.error || "Error");
      if (res.offline) setOffline(true);
    }
    setLoading(false);
  }, [path]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  return { data, loading, error, offline, reload: load };
}