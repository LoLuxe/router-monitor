// /api/register — подписка пользователя на уведомления через дашборд
// POST { "chat_id": "123456789" }

import { Redis } from '@upstash/redis';
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { chat_id } = req.body || {};
  if (!chat_id || !/^\d+$/.test(String(chat_id))) {
    return res.status(400).json({ error: 'Неверный chat_id' });
  }

  const id = String(chat_id);

  // Проверяем что пользователь существует (отправляем тестовое сообщение)
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        text: '✅ <b>Подписка активирована!</b>\n\nВы будете получать уведомления об отключении света.',
        parse_mode: 'HTML'
      })
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return res.status(400).json({ error: `Telegram: ${tgData.description}` });
    }
  } catch {
    return res.status(500).json({ error: 'Не удалось связаться с Telegram' });
  }

  // Добавляем в set подписчиков
  await kv.sadd('tg_users', id);

  res.status(200).json({ ok: true });
}
