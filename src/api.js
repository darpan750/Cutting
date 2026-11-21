import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = url && key && !url.includes('YOUR_PROJECT') && !key.includes('REPLACE_ME');
export const client = configured ? createClient(url, key) : null;

export async function checked(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export const rpc = (name, args) => checked(client.rpc(name, args));

export function useResource(load, key, signal) {
  const [result, setResult] = useState({ key: null, data: null, error: null, loading: true });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    setResult(current => ({ key, data: current.key === key ? current.data : null, error: null, loading: true }));
    try {
      const data = await load();
      if (ticket === sequence.current) setResult({ key, data, error: null, loading: false });
    } catch (error) {
      if (ticket === sequence.current) setResult(current => ({ ...current, error, loading: false }));
    }
  }, [key, load]);
  useEffect(() => {
    refresh();
    return () => { sequence.current += 1; };
  }, [refresh, signal]);
  return result.key === key ? { ...result, refresh } : { data: null, error: null, loading: true, refresh };
}

export function useSync(userId, refresh) {
  const [status, setStatus] = useState('Connecting');
  useEffect(() => {
    if (!userId) return undefined;
    let timer;
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 220);
    };
    const offline = () => setStatus('Offline');
    const online = () => {
      setStatus('Reconnecting');
      invalidate();
    };
    const visible = () => { if (!document.hidden && navigator.onLine) invalidate(); };
    const channel = client.channel(`cutting-book-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'archive_signal' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'book_settings' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `user_id=eq.${userId}` }, invalidate)
      .subscribe(state => {
        setStatus(!navigator.onLine ? 'Offline' : state === 'SUBSCRIBED' ? 'Live' : 'Reconnecting');
        if (state === 'SUBSCRIBED') invalidate();
      });
    const poll = setInterval(visible, 30_000);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
      client.removeChannel(channel);
    };
  }, [userId, refresh]);
  return status;
}
