// /api/check — вызывается cron-job.org каждые 3 минуты
// Отправляет алерт если роутер молчит >5 мин (и алерт ещё не был отправлен)

import { kv } from '@vercel/kv';

const OFFLINE_THRESHOLD = 5 * 60;    // 5 мин
const ALERT_COOLDOWN    = 30 * 60;   // повтор алерта не чаще раза в 30 мин
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramAlert(message) {
  const users = await kv.smembers('tg_users');
  if (!users || users.length === 0) return 0;

  const promises = users.map(chatId =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    })
  );
  await Promise.allSettled(promises);
  return users.length;
}

export default async function handler(req, res) {
  // Простая защита от случайных запросов
  const secret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const [lastPing, lastAlert] = await Promise.all([
    kv.get('last_ping'),
    kv.get('last_alert_sent')
  ]);

  if (!lastPing) {
    return res.status(200).json({ status: 'no_data' });
  }

  const silenceSec = Math.round((now - lastPing) / 1000);

  if (silenceSec <= OFFLINE_THRESHOLD) {
    // Всё ок, сбрасываем флаг алерта если был
    if (lastAlert) await kv.del('last_alert_sent');
    return res.status(200).json({ status: 'online', silence_seconds: silenceSec });
  }

  // Роутер молчит >5 мин
  if (lastAlert && (now - lastAlert) < ALERT_COOLDOWN * 1000) {
    return res.status(200).json({ status: 'offline', alert: 'already_sent', silence_seconds: silenceSec });
  }

  // Шлём алерт
  const offlineMin = Math.round(silenceSec / 60);
  const timeStr = new Date(lastPing).toLocaleString('ru-RU', { timeZone: 'Europe/Vilnius' });
  const count = await sendTelegramAlert(
    `🔴 <b>Нет света!</b>\n\nРоутер не выходил на связь <b>${offlineMin} мин</b>.\n` +
    `Последний сигнал: ${timeStr}`
  );

  await kv.set('last_alert_sent', now);

  res.status(200).json({ status: 'offline', alert_sent: count, silence_seconds: silenceSec });
}
