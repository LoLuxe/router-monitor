// /api/status — дашборд читает этот эндпоинт

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const [lastPing, history] = await Promise.all([
    kv.get('last_ping'),
    kv.lrange('ping_history', 0, 4)
  ]);

  if (!lastPing) {
    return res.status(200).json({ status: 'no_data', history: [] });
  }

  const silenceSec = Math.round((Date.now() - lastPing) / 1000);
  // Считаем оффлайн если нет сигнала >5 мин
  const status = silenceSec > 300 ? 'OFFLINE' : 'ONLINE';

  res.status(200).json({
    status,
    silence_seconds: silenceSec,
    last_ping: lastPing,
    history: history || []
  });
}
