// Vercel Serverless Function: POST /api/browser-auth
// Регистрация и вход через придуманные имя + PIN (для входа не из Telegram).
// Body: { mode: 'register' | 'login', displayName, pin }
//
// Хэширование PIN — scrypt(pin, salt), а не голый sha256: пароль без соли
// одинаков у всех, кто ввёл один и тот же PIN, и перебирается почти мгновенно
// при утечке хэша. Соль своя для каждого пользователя (столбец pin_salt).
//
// Обратная совместимость: у пользователей, заведённых до этого изменения,
// pin_salt пуст, а pin_hash — старый sha256(pin) без соли. Такие аккаунты
// по-прежнему могут войти (сверяем по старой схеме), и сразу же прозрачно
// переводятся на scrypt+соль — pin_hash/pin_salt перезаписываются переданным
// PIN-ом. Через какое-то время после того как все реальные пользователи хоть
// раз войдут, старую ветку sha256 можно будет убрать.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCRYPT_KEYLEN = 64;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function scryptHex(pin, salt) {
  return crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Сравнение постоянного времени — не даёт судить о совпадении по времени ответа.
// Хэши могут быть разной длины (старый sha256 — 64 hex-символа, scrypt — 128),
// поэтому сначала проверяем длину и только потом сравниваем содержимое.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'hex');
  const bufB = Buffer.from(String(b || ''), 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashPin(pin) {
  const salt = newSalt();
  return { pinHash: scryptHex(pin, salt), pinSalt: salt };
}

// Возвращает true, если pin подходит под сохранённый хэш (новая или старая схема).
function verifyPin(pin, user) {
  if (user.pin_salt) {
    return safeEqual(scryptHex(pin, user.pin_salt), user.pin_hash);
  }
  // Легаси-запись без соли — старая схема sha256(pin).
  return safeEqual(sha256Hex(pin), user.pin_hash);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Сервер не настроен — проверь переменные окружения' });
    return;
  }

  const { mode, displayName, pin } = req.body || {};

  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    res.status(400).json({ error: 'Укажи имя' });
    return;
  }
  if (!pin || typeof pin !== 'string' || pin.length < 4) {
    res.status(400).json({ error: 'PIN должен быть не короче 4 символов' });
    return;
  }
  // Только для новых аккаунтов: UI даёт цифровую клавиатуру, так что и хранить
  // должны только то, что реально можно ввести. Существующие нецифровые PIN-ы
  // (если такие есть) продолжат работать при входе — это ограничение только на регистрацию.
  if (mode === 'register' && !/^\d+$/.test(pin)) {
    res.status(400).json({ error: 'PIN должен состоять только из цифр' });
    return;
  }

  const name = displayName.trim();
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (mode === 'register') {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('display_name', name)
        .is('telegram_id', null)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) {
        res.status(409).json({ error: 'Это имя уже занято — выбери другое или войди с существующим PIN' });
        return;
      }

      const { pinHash, pinSalt } = hashPin(pin);
      const { data: created, error: createErr } = await supabaseAdmin
        .from('users')
        .insert({ display_name: name, pin_hash: pinHash, pin_salt: pinSalt })
        .select('id, display_name')
        .single();
      if (createErr) throw createErr;

      res.status(200).json({ ok: true, userId: created.id, displayName: created.display_name });
      return;
    }

    if (mode === 'login') {
      const { data: user, error: findErr } = await supabaseAdmin
        .from('users')
        .select('id, display_name, pin_hash, pin_salt')
        .ilike('display_name', name)
        .is('telegram_id', null)
        .maybeSingle();
      if (findErr) throw findErr;

      if (!user || !verifyPin(pin, user)) {
        res.status(401).json({ error: 'Неверное имя или PIN' });
        return;
      }

      // Прозрачная миграция легаси-аккаунтов (без соли) на scrypt+соль при первом же успешном входе.
      if (!user.pin_salt) {
        const { pinHash, pinSalt } = hashPin(pin);
        await supabaseAdmin.from('users').update({ pin_hash: pinHash, pin_salt: pinSalt }).eq('id', user.id);
      }

      res.status(200).json({ ok: true, userId: user.id, displayName: user.display_name });
      return;
    }

    res.status(400).json({ error: 'Неизвестный режим — ожидается register или login' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера', details: String(e.message || e) });
  }
}
