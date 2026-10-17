import { db, getUser, json, startOfTodayWIB } from '@/lib/server';

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data } = await db().from('send_log')
    .select('id,account_email,phone,target_email,template_title,status,error,created_at')
    .eq('user_id', u.id).order('created_at', { ascending: false }).limit(30);
  const { data: setting } = await db().from('app_settings').select('value').eq('key', 'daily_user_limit').maybeSingle();
  const limit = Math.max(1, Math.min(100, Number(setting?.value || process.env.DAILY_LIMIT || 10)));
  const { count } = await db().from('send_log').select('id', { count: 'exact', head: true })
    .eq('user_id', u.id).eq('status', 'terkirim').gte('created_at', startOfTodayWIB());
  return json({ items: data || [], today: count || 0, limit });
}
