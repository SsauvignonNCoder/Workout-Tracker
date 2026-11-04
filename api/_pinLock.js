// Блокировка входа по PIN после серии неудач. С закрытой базой (§24.7) PIN —
// единственная защита браузерного аккаунта, а четыре цифры без ограничения попыток
// перебираются. Считаем неудачи на аккаунт; блокировка короткая, чтобы посторонний
// не мог надолго запереть чужой аккаунт.

export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MIN = 15;

export function isPinLocked(user, nowMs = Date.now()) {
  if (!user || !user.pin_locked_until) return false;
  return new Date(user.pin_locked_until).getTime() > nowMs;
}

// Что записать пользователю после неудачной попытки.
export function pinFailurePatch(user, nowMs = Date.now()) {
  const fails = (Number(user && user.pin_fail_count) || 0) + 1;
  if (fails < PIN_MAX_FAILS) return { pin_fail_count: fails };
  return { pin_fail_count: 0, pin_locked_until: new Date(nowMs + PIN_LOCK_MIN * 60000).toISOString() };
}

// Что сбросить после удачного входа (null — сбрасывать нечего).
export function pinSuccessPatch(user) {
  if (!user || (!user.pin_fail_count && !user.pin_locked_until)) return null;
  return { pin_fail_count: 0, pin_locked_until: null };
}
