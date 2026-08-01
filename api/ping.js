// /api/ping  — роутер стучится сюда каждые 2 минуты
// Сохраняет timestamp, проверяет не было ли пропадания >5 мин

import { Redis } from '@upstash/redis';
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const OFFLINE_THRESHOLD = 5 * 60; // 5 минут в секундах
const HISTORY_MAX = 5;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramAlert(message) {
  const users = await kv.smembers('tg_users');
  if (!users || users.length === 0) return;

  const promises = users.map(chatId =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    })
  );
  await Promise.allSettled(promises);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();

  // Читаем предыдущий ping
  const lastPing = await kv.get('last_ping');

  if (lastPing) {
    const silenceSec = Math.round((now - lastPing) / 1000);

    // Если пропадание было >5 мин — значит свет возвращается, шлём алерт
    if (silenceSec > OFFLINE_THRESHOLD) {
      const offlineMin = Math.round(silenceSec / 60);
      const timeStr = new Date(lastPing).toLocaleString('ru-RU', { timeZone: 'Europe/Vilnius' });
      await sendTelegramAlert(
        `⚡️ <b>Свет вернулся!</b>\n\nРоутер был недоступен <b>${offlineMin} мин</b>.\n` +
        `Последний сигнал до отключения: ${timeStr}`
      );
    }
  }

  // Сохраняем новый timestamp
  await kv.set('last_ping', now);

  // Обновляем историю (последние 5)
  await kv.lpush('ping_history', now);
  await kv.ltrim('ping_history', 0, HISTORY_MAX - 1);

  res.status(200).json({ ok: true, ts: now });
}
