// Лучший подход упражнения — общее правило для итоговых «вес» и «повторы» записи.
//
// Рабочий вес — максимальный вес в подходах; повторы — лучший подход с этим весом
// (максимум повторов). Без веса (подтягивания, брусья, планка) вес везде 0, и
// повторы — просто лучший подход.
//
// Зачем отдельно: раньше пошаговая тренировка брала повторы ПОСЛЕДНЕГО подхода с
// максимальным весом — у подтягиваний без отягощения это был последний, самый
// слабый подход (10, 9, 8 → записывалось 8). На этом числе стоят рекорды, экспорт
// недели и достижения, поэтому старые записи App пересчитывает при загрузке
// (withBestSet), а новые сразу сохраняются правильно.

export function bestSetOf(sets) {
  let best = null;
  (sets || []).forEach((x) => {
    const w = parseFloat(x && x.weight) || 0;
    const r = parseInt(x && x.reps, 10) || 0;
    if (w <= 0 && r <= 0) return;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  });
  return best;
}

// Упражнение записи с итогами по лучшему подходу. Нет подходов по отдельности
// (ручная запись) — как есть. Ничего не поменялось — тот же объект.
export function withBestSet(ex) {
  if (!ex || !Array.isArray(ex.setLog) || ex.setLog.length === 0) return ex;
  const best = bestSetOf(ex.setLog);
  if (!best) return ex;
  if (Number(ex.weight) === best.weight && Number(ex.reps) === best.reps) return ex;
  return { ...ex, weight: best.weight, reps: best.reps };
}
