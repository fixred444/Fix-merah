'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/client';

export default function Home() {
  const r = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => r.replace(data.session ? '/menu' : '/masuk'));
  }, [r]);
  return null;
}
