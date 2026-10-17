import { db, getUser, json } from '@/lib/server';

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const [t, g, pool] = await Promise.all([
    db().from('templates').select('id,title').order('created_at'),
    db().from('targets').select('id,label').eq('active', true).order('created_at'),
    db().from('accounts').select('id,email').eq('shared_enabled', true).order('created_at'),
  ]);
  return json({ templates: t.data || [], targets: g.data || [], globalSenderCount: (pool.data || []).length });
}
