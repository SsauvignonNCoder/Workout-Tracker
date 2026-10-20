// Vercel Serverless Function: POST /api/ai-assistant
//
// Чат-ассистент по собственным тренировочным данным. Модель отвечает на вопрос,
// а данные добирает сама через набор функций-инструментов (tool use).
//
// ПОЧЕМУ ТОЛЬКО TELEGRAM. В приложении нет подписанного токена сессии: вход по
// имени и PIN возвращает голый `userId`, который фронтенд кладёт в sessionStorage.
// Для остальных экранов это принятый компромисс (§3.2 хендоффа), но ассистент
// читает всю историю тренировок и тратит платные токены — принимать `user_id` на
// веру здесь нельзя, иначе любой, кто знает чужой идентификатор, прочитает чужие
// данные и сожжёт чужую квоту. Подпись `initData` — единственное, что в проекте
// проверяется по-настоящему, поэтому ассистент живёт только внутри Telegram.
//
// ДВА КЛИЕНТА К БАЗЕ, И ЭТО ВАЖНО.
//   1. `admin` (service_role) — только служебное: найти пользователя по telegram_id
//      и вести счётчики лимитов. Эти таблицы закрыты RLS без единой политики,
//      поэтому доступ к ним есть лишь у service_role.
//   2. `reader` — под ролью `ai_readonly`, у которой в Postgres есть ТОЛЬКО SELECT
//      на sessions/measurements/profile. Даже ошибка в коде не сможет ничего
//      изменить: база отклонит запрос (проверено, `permission denied`). Таблица
//      users этой роли недоступна вовсе — там хэши PIN.
//   Разграничение по пользователю RLS в этом проекте НЕ делает (политики открытые,
//   пользовательских JWT нет), поэтому фильтр `user_id` в каждом запросе ниже —
//   обязателен и является единственной защитой от чтения чужих данных.
//
// Роль подключается так же, как работает обычный anon-ключ: это HS256-токен,
// подписанный секретом проекта, с полем role. Мы выпускаем такой же, но с
// `role: ai_readonly`, живёт он минуту.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { checkTelegramAuth } from './_telegram.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

const AI_API_KEY = process.env.DEEPSEEK_API_KEY;
// Идентификатор модели вынесен в переменную окружения намеренно: если он
// изменится, это правка настройки, а не выкладка кода.
const AI_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const AI_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

const DAILY_LIMIT = 5;              // запросов в день на пользователя
const MONTHLY_TOKEN_BLOCK_AT = 950000; // порог месячного бюджета (запас до 1 000 000)
const MAX_TOOL_ROUNDS = 5;          // сколько раз подряд модель может звать инструменты
const MAX_TOKENS = 1024;            // потолок длины ответа
const MAX_SESSIONS = 60;            // сколько тренировок отдавать модели за раз
const MAX_MEASUREMENTS = 200;

// ---------- Токен роли ai_readonly ----------

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Идентификатор проекта — первая часть имени хоста Supabase. Он есть в штатном
// anon-ключе, поэтому кладём и сюда: токен получается структурно тем же самым,
// только с другой ролью.
function projectRef() {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch (e) {
    return undefined;
  }
}

function mintReadonlyJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: 'supabase', ref: projectRef(), role: 'ai_readonly', iat: now, exp: now + 60 };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

// ---------- Инструменты, доступные модели ----------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_sessions',
      description: 'Тренировки пользователя с упражнениями и кардио. Без указания дат возвращает последние тренировки. Даты в формате ГГГГ-ММ-ДД.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Начало периода, ГГГГ-ММ-ДД' },
          date_to: { type: 'string', description: 'Конец периода, ГГГГ-ММ-ДД' },
          exercise: { type: 'string', description: 'Оставить только тренировки, где встречается упражнение с таким текстом в названии' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_measurements',
      description: 'Замеры веса тела по датам.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Начало периода, ГГГГ-ММ-ДД' },
          date_to: { type: 'string', description: 'Конец периода, ГГГГ-ММ-ДД' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prs',
      description: 'Личные рекорды по каждому упражнению за всю историю. Для упражнений с весом — максимальный рабочий вес, для упражнений без веса — максимум повторов, для планки и удержаний — максимум секунд.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profile',
      description: 'Параметры тела (рост, талия, бёдра, грудь, плечи, процент жира — последние значения и body_history, история замеров по датам), текущий план тренировок (plan_id) и последний сделанный день этого плана.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const SYSTEM_PROMPT = `Ты — помощник в личном приложении «Дневник тренировок». Отвечаешь его владельцу на русском языке, на «ты», коротко и по делу.

Правила:
- Все числа бери ТОЛЬКО из инструментов. Ничего не додумывай и не округляй «на глаз».
- Если данных для ответа нет — так и скажи, не выдумывай.
- Не давай медицинских рекомендаций и не ставь диагнозов.
- Отвечай в 2–5 предложениях, если вопрос не требует большего. Списком — когда перечисляешь.
- Даты пиши по-человечески: «17 августа», а не «2026-08-17».
- Веса в килограммах, дистанции в километрах, время в минутах.

Планы тренировок. Каждый — цикл из 24 дней: четыре недели по шесть дней (ПН–СБ, воскресенье — отдых). Поле plan_id в тренировке — к какому плану она относится, program_day — номер дня в цикле ЭТОГО плана (в разных планах один и тот же номер — разные тренировки). В профиле plan_id — план, который ведётся сейчас.
- plan1 «Сила, кардио, бассейн» (все тренировки до 18 октября 2026): понедельник силовая (грудь, спина, плечи), вторник кардио на дорожке, среда силовая (ноги), четверг бассейн, пятница силовая (руки, кор), суббота кардио. Недели: 1 база, 2 объём, 3 интенсив, 4 разгрузка.
- plan2 «Сплит 6 дней» (с 19 октября 2026): все шесть дней силовые, после каждой — кардио-финишер на дорожке. ПН грудь + руки (тяжёлый), ВТ плечи + спина (тяжёлый), СР ноги (тяжёлый), ЧТ грудь + руки (объёмный), ПТ плечи + спина (объёмный), СБ ноги + ягодицы (объёмный). Недели: 1 база, 2 объём (+1 подход на основном упражнении), 3 тяжёлая (основное движение ПН–СР на 2–4 повтора), 4 разгрузка (подходов примерно на треть меньше, веса на 10–15% легче).

У упражнения могут быть пометки: replaced_from — каким упражнением плана его заменили по ходу тренировки; added — добавлено сверх плана; minutes_on_exercise — время по секундомеру упражнения.`;

// ---------- Реализация инструментов ----------
// В КАЖДОМ запросе обязателен .eq('user_id', userId).

// Итоги упражнения по лучшему подходу: рабочий вес и максимум повторов с ним
// (то же правило, что src/bestSet.js в приложении). Старые записи пошаговой
// тренировки хранили повторы последнего подхода — по ним считать нельзя.
function bestOf(e) {
  let best = null;
  (Array.isArray(e.setLog) ? e.setLog : []).forEach((x) => {
    const w = Number(x && x.weight) || 0;
    const r = Number(x && x.reps) || 0;
    if (w <= 0 && r <= 0) return;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  });
  return best || { weight: Number(e.weight) || 0, reps: Number(e.reps) || 0 };
}

function compactSession(row) {
  const out = { date: row.date };
  if (row.program_day) {
    out.program_day = row.program_day;
    out.plan_id = row.plan_id || 'plan1';
  }
  const ex = (row.exercises || [])
    .filter((e) => e && e.name)
    .map((e) => {
      const o = { name: e.name };
      const b = bestOf(e);
      if (b.weight > 0) o.weight_kg = b.weight;
      if (b.reps > 0) o.reps = b.reps;
      if (Number(e.sets) > 0) o.sets = Number(e.sets);
      if (e.timed) o.seconds = b.reps || 0;
      if (e.note) o.note = e.note;
      if (e.replacedFrom) o.replaced_from = e.replacedFrom;
      if (e.added) o.added = true;
      if (Number(e.durationSec) > 0) o.minutes_on_exercise = Math.round(Number(e.durationSec) / 6) / 10;
      return o;
    });
  if (ex.length) out.exercises = ex;
  const cardio = (row.cardio || [])
    .filter((c) => c && c.name)
    .map((c) => {
      const o = { name: c.name };
      if (Number(c.distance) > 0) o.km = Number(c.distance);
      if (Number(c.speed) > 0) o.kmh = Number(c.speed);
      if (Number(c.incline) > 0) o.incline_pct = Number(c.incline);
      if (Number(c.duration) > 0) o.minutes = Number(c.duration);
      return o;
    });
  if (cardio.length) out.cardio = cardio;
  if (row.route_name) out.route = row.route_name;
  if (row.duration_sec > 0) out.duration_min = Math.round(row.duration_sec / 60);
  if (row.difficulty) out.difficulty_1_5 = row.difficulty;
  if (row.sleep) out.sleep_h = row.sleep;
  if (row.energy) out.energy_1_5 = row.energy;
  if (row.feeling) out.feeling = row.feeling;
  return out;
}

async function toolGetSessions(reader, userId, args) {
  let q = reader.from('sessions').select('*').eq('user_id', userId).order('date', { ascending: false });
  if (args.date_from) q = q.gte('date', args.date_from);
  if (args.date_to) q = q.lte('date', args.date_to);
  const { data, error } = await q.limit(MAX_SESSIONS);
  if (error) throw error;
  let rows = data || [];
  if (args.exercise) {
    const needle = String(args.exercise).toLowerCase().replace(/ё/g, 'е');
    rows = rows.filter((r) => (r.exercises || []).some((e) =>
      String(e.name || '').toLowerCase().replace(/ё/g, 'е').includes(needle)));
  }
  return { count: rows.length, sessions: rows.map(compactSession) };
}

async function toolGetMeasurements(reader, userId, args) {
  let q = reader.from('measurements').select('date, weight').eq('user_id', userId).order('date', { ascending: false });
  if (args.date_from) q = q.gte('date', args.date_from);
  if (args.date_to) q = q.lte('date', args.date_to);
  const { data, error } = await q.limit(MAX_MEASUREMENTS);
  if (error) throw error;
  const rows = (data || []).filter((m) => m.weight != null);
  return { count: rows.length, measurements: rows.map((m) => ({ date: m.date, weight_kg: m.weight })) };
}

// Логика повторяет computeRecords из src/gamification.js: у упражнений с весом
// рекорд — максимальный рабочий вес, у остальных — максимум повторов, а у
// удержаний (планка) — максимум секунд.
const WEIGHTLESS_RE = /планка|русский твист|скручиван.*наклон|подъ[её]м ног/;
const TIMED_RE = /планк|вакуум|удержан/;

async function toolGetPrs(reader, userId) {
  const { data, error } = await reader.from('sessions').select('date, exercises').eq('user_id', userId);
  if (error) throw error;
  const records = {};
  (data || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      if (!ex || !ex.name) return;
      const name = ex.name;
      const b = bestOf(ex);
      const w = b.weight;
      if (w > 0) {
        const prev = records[name];
        if (!prev || !prev.weight_kg || w > prev.weight_kg) {
          records[name] = { weight_kg: w, reps: b.reps || null, date: s.date };
        }
        return;
      }
      const val = b.reps;
      if (val <= 0) return;
      const n = name.toLowerCase().replace(/ё/g, 'е');
      const timed = ex.timed || TIMED_RE.test(n);
      const prev = records[name];
      if (prev && prev.weight_kg) return;
      if (!prev || val > (prev.value || 0)) {
        records[name] = timed ? { seconds: val, date: s.date } : { reps: val, date: s.date, value: val };
      }
    });
  });
  Object.values(records).forEach((r) => { delete r.value; });
  return { records };
}

async function toolGetProfile(reader, userId) {
  const { data, error } = await reader.from('profile').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return { profile: null };
  return {
    profile: {
      height_cm: data.height, waist_cm: data.waist, hips_cm: data.hips,
      chest_cm: data.chest, shoulders_cm: data.shoulders, body_fat_pct: data.body_fat,
      updated: data.updated_at,
      plan_id: data.plan_id || 'plan1',
      last_program_day: data.last_program_day ?? null,
      // История замеров параметров тела (поля выше — последние значения).
      // Только мерившиеся в тот день параметры, последние 30 замеров.
      body_history: (Array.isArray(data.body_log) ? data.body_log : [])
        .filter((e) => e && typeof e.date === 'string')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30)
        .map((e) => {
          const out = { date: e.date };
          [['height', 'height_cm'], ['waist', 'waist_cm'], ['hips', 'hips_cm'], ['chest', 'chest_cm'],
            ['shoulders', 'shoulders_cm'], ['bodyFat', 'body_fat_pct']].forEach(([k, name]) => {
            if (e[k] != null) out[name] = e[k];
          });
          return out;
        }),
    },
  };
}

async function runTool(reader, userId, name, args) {
  if (name === 'get_sessions') return toolGetSessions(reader, userId, args || {});
  if (name === 'get_measurements') return toolGetMeasurements(reader, userId, args || {});
  if (name === 'get_prs') return toolGetPrs(reader, userId);
  if (name === 'get_profile') return toolGetProfile(reader, userId);
  return { error: `Неизвестный инструмент: ${name}` };
}

// ---------- Лимиты ----------

function monthStart() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function checkLimits(admin, userId) {
  const [daily, monthly] = await Promise.all([
    admin.from('ai_daily_usage').select('request_count').eq('user_id', userId).eq('usage_date', todayUtc()).maybeSingle(),
    admin.from('ai_monthly_usage').select('total_tokens').eq('usage_month', monthStart()).maybeSingle(),
  ]);
  if (daily.error) throw daily.error;
  if (monthly.error) throw monthly.error;
  const used = (daily.data && daily.data.request_count) || 0;
  const tokens = (monthly.data && monthly.data.total_tokens) || 0;
  if (used >= DAILY_LIMIT) {
    return { ok: false, code: 'daily_limit', error: `На сегодня лимит исчерпан — ${DAILY_LIMIT} вопросов в день. Возвращайся завтра.` };
  }
  if (tokens >= MONTHLY_TOKEN_BLOCK_AT) {
    return { ok: false, code: 'monthly_limit', error: 'Месячный бюджет ассистента исчерпан. Он снова заработает в начале следующего месяца.' };
  }
  return { ok: true, used };
}

async function recordUsage(admin, userId, tokens, usedBefore) {
  try {
    await admin.from('ai_daily_usage').upsert(
      { user_id: userId, usage_date: todayUtc(), request_count: usedBefore + 1 },
      { onConflict: 'user_id,usage_date' },
    );
    const month = monthStart();
    const { data } = await admin.from('ai_monthly_usage').select('total_tokens').eq('usage_month', month).maybeSingle();
    const before = (data && data.total_tokens) || 0;
    await admin.from('ai_monthly_usage').upsert(
      { usage_month: month, total_tokens: before + (tokens || 0) },
      { onConflict: 'usage_month' },
    );
  } catch (e) {
    // Счётчик — не повод терять уже полученный ответ. Пишем в лог и идём дальше.
    console.error('ai-assistant: не удалось записать расход', e);
  }
}

// ---------- Обработчик ----------

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const missing = [
    !BOT_TOKEN && 'TELEGRAM_BOT_TOKEN',
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
    !JWT_SECRET && 'SUPABASE_JWT_SECRET',
    !AI_API_KEY && 'DEEPSEEK_API_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error('ai-assistant: не заданы переменные окружения:', missing.join(', '));
    res.status(200).json({
      ok: false, code: 'not_configured',
      error: 'Ассистент ещё не подключён — на сервере не хватает настроек.',
    });
    return;
  }

  const { initData, question } = req.body || {};

  const tgUser = checkTelegramAuth(initData, BOT_TOKEN);
  if (!tgUser) {
    res.status(401).json({
      ok: false, code: 'telegram_only',
      error: 'Ассистент работает только внутри Telegram — открой приложение через бота.',
    });
    return;
  }

  const q = typeof question === 'string' ? question.trim() : '';
  if (!q) { res.status(400).json({ ok: false, code: 'empty', error: 'Пустой вопрос' }); return; }
  if (q.length > 500) {
    res.status(400).json({ ok: false, code: 'too_long', error: 'Вопрос слишком длинный — уложись в 500 символов.' });
    return;
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: user, error: userErr } = await admin
      .from('users').select('id').eq('telegram_id', tgUser.id).maybeSingle();
    if (userErr) throw userErr;
    if (!user) {
      res.status(200).json({ ok: false, code: 'no_account', error: 'Не нашёл твой аккаунт — открой приложение заново через бота.' });
      return;
    }
    const userId = user.id;

    const limits = await checkLimits(admin, userId);
    if (!limits.ok) { res.status(200).json(limits); return; }

    // Клиент под ролью только для чтения. apikey остаётся публичным ключом
    // проекта (его проверяет шлюз), а роль берётся из заголовка Authorization.
    const reader = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${mintReadonlyJwt()}` } },
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: q },
    ];

    let answer = null;
    let totalTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1;
      const body = {
        model: AI_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
      };
      // На последнем круге инструменты не предлагаем — нужен текстовый ответ
      // по уже собранным данным, иначе цикл мог бы не закончиться никогда.
      if (!isLastRound) { body.tools = TOOLS; body.tool_choice = 'auto'; }

      const r = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const details = await r.text().catch(() => '');
        console.error('ai-assistant: модель ответила ошибкой', r.status, details.slice(0, 500));
        res.status(200).json({ ok: false, code: 'model_error', error: 'Модель сейчас недоступна — попробуй чуть позже.' });
        return;
      }

      const data = await r.json();
      const usage = data.usage || {};
      totalTokens += usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));

      const choice = (data.choices && data.choices[0]) || null;
      if (!choice) break;
      const msg = choice.message || {};

      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push(msg);
        for (const call of msg.tool_calls) {
          let result;
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            result = await runTool(reader, userId, call.function.name, args);
          } catch (e) {
            console.error('ai-assistant: инструмент упал', call.function && call.function.name, e);
            result = { error: 'Не удалось получить данные' };
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }

      answer = (msg.content || '').trim();
      break;
    }

    await recordUsage(admin, userId, totalTokens, limits.used);

    if (!answer) {
      res.status(200).json({ ok: false, code: 'empty_answer', error: 'Не получилось собрать ответ — попробуй переформулировать вопрос.' });
      return;
    }

    res.status(200).json({ ok: true, answer, remaining_today: Math.max(0, DAILY_LIMIT - limits.used - 1) });
  } catch (e) {
    console.error('ai-assistant: непредвиденная ошибка', e);
    res.status(200).json({ ok: false, code: 'server', error: 'Что-то пошло не так на сервере. Попробуй ещё раз.' });
  }
}
