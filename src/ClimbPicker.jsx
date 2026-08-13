import React, { useState } from 'react';
import { ChevronDown, Mountain, MapPin, Route } from 'lucide-react';
import { useTheme } from './theme.js';
import {
  CLIMBS, CLIMB_CLASSES, climbsOfClass, climbStages, climbCaption,
} from './climbs.js';

// Кнопка «взять готовый маршрут» рядом с полем цели по набору высоты.
// Раскрывается списком реальных маршрутов, сгруппированных по классу сложности.
//
// Класс здесь — СВОЙСТВО маршрута, а не переключатель: профиль берётся из
// GPS-трека как есть, крутизну рельефа переключателем не изменить. Класс
// определяется набором высоты, то есть нагрузкой за тренировку.
export function ClimbPicker({ onPick, currentClimb }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const pick = (climb, stage) => {
    onPick({
      target: String(stage.gain),
      sectors: stage.sectors.map((s) => ({
        distance: String(s.distance),
        incline: String(s.incline),
        speed: '',
        clock: '',
      })),
      climb: {
        id: climb.id,
        name: climb.name,
        place: climb.place,
        stage: stage.index,
        stages: stage.total,
        gain: stage.gain,
      },
    });
    setOpen(false);
    setExpandedId(null);
  };

  return (
    <div style={{ marginTop: 10 }}>
      {/* Кнопка-раскрывашка. Форма и высота — как у кнопки сворачивания тренировки. */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '10px 12px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${open ? t.ACCENT : t.BORDER}`,
          background: open ? t.ACCENT_BG : t.BG_INPUT,
          color: open ? t.ACCENT_SOFT : t.TEXT_DIM,
          fontSize: 13, fontWeight: 700, textAlign: 'left',
        }}
      >
        <Mountain size={15} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentClimb
            ? `${currentClimb.name}${currentClimb.stages > 1 ? ` · этап ${currentClimb.stage}/${currentClimb.stages}` : ''}`
            : 'Взять готовый маршрут'}
        </span>
        <ChevronDown
          size={16}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}
        />
      </button>

      {!open && currentClimb && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: t.TEXT_FAINT }}>
          {currentClimb.place} · цель {currentClimb.gain} м
        </div>
      )}

      {open && (
        <div style={{
          marginTop: 10, border: `1px solid ${t.BORDER}`, borderRadius: 14,
          background: t.BG_INPUT, overflow: 'hidden',
        }}>
          {CLIMBS.length === 0 && (
            <div style={{
              padding: '18px 14px', fontSize: 12.5, color: t.TEXT_DIM,
              lineHeight: 1.5, textAlign: 'center',
            }}>
              Коллекция пока пуста — маршруты добавляются из GPX-треков.
            </div>
          )}

          {CLIMB_CLASSES.map((cls) => {
            const items = climbsOfClass(cls.id);
            if (!items.length) return null;
            return (
              <div key={cls.id}>
                <div style={{
                  padding: '8px 12px', background: t.BG_RAISED,
                  borderTop: `1px solid ${t.BORDER}`, borderBottom: `1px solid ${t.BORDER}`,
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: t.ACCENT_SOFT,
                    textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: t.FONT_MONO,
                  }}>
                    {cls.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontFamily: t.FONT_MONO }}>
                    до {cls.budget} м
                  </span>
                </div>

                {items.map((c) => {
                  const stages = climbStages(c);
                  const isOpen = expandedId === c.id;
                  const inc = c.segs.map(([, g]) => g);
                  return (
                    <div key={c.id} style={{ borderBottom: `1px solid ${t.BORDER}` }}>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : c.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 12px', border: 'none',
                          background: isOpen ? t.ACCENT_BG : 'transparent',
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <Route size={14} style={{ flexShrink: 0, color: t.TEXT_FAINT }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13.5, fontWeight: 700, color: t.TEXT,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: 11, color: t.TEXT_FAINT, marginTop: 2 }}>
                            {climbCaption(c)}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 12.5, fontWeight: 700, color: t.ACCENT_SOFT,
                          fontFamily: t.FONT_MONO, flexShrink: 0,
                        }}>
                          ↑{c.gain}
                        </span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: '0 12px 12px' }}>
                          <div style={{ fontSize: 11.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 9 }}>
                            {c.note}
                          </div>
                          <div style={{
                            fontSize: 11, color: t.TEXT_FAINT, marginBottom: 9,
                            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                          }}>
                            <MapPin size={11} /> {c.place} · {c.start}→{c.top} м ·
                            уклоны {Math.min(...inc)}–{Math.max(...inc)}%
                          </div>
                          {stages.map((st) => (
                            <button
                              key={st.index}
                              onClick={() => pick(c, st)}
                              style={{
                                width: '100%', marginBottom: 6, padding: '10px 12px',
                                borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                                border: `1px solid ${t.ACCENT}`, background: t.ACCENT_BG,
                                color: t.TEXT, textAlign: 'left',
                              }}
                            >
                              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                                {st.total > 1 ? `Этап ${st.index} из ${st.total}` : 'Взять этот маршрут'}
                              </div>
                              <div style={{
                                fontSize: 11.5, color: t.TEXT_DIM, marginTop: 3, fontFamily: t.FONT_MONO,
                              }}>
                                {st.sectors.length} сект · {st.distance} км · ↑{st.gain} м
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {CLIMBS.length > 0 && (
            <div style={{ padding: '10px 12px', fontSize: 10.5, color: t.TEXT_FAINT, lineHeight: 1.45 }}>
              Профили сняты с GPS-треков как есть: спуски вырезаны, уклон обрезан
              по 30%. Класс определяется набором высоты. Скорость и время вводишь сам.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClimbPicker;
