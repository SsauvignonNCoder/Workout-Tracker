import React, { useState, useMemo } from 'react';
import { FileDown, Copy, Check } from 'lucide-react';
import { useTheme } from '../theme.js';
import { fmtDateShort } from '../dateUtils.js';
import { listExportableWeeks, buildWeekMarkdown, weekFilename } from '../weekExport.js';

// Панель экспорта результатов недели в Markdown-файл.
// Итог включает: результат по каждому упражнению, прогрессию к прошлой неделе,
// отметку личных рекордов и маркировку упражнений/дней плана, которые не были записаны.
export function WeekExportPanel({ sessions }) {
  const t = useTheme();
  const weeks = useMemo(() => listExportableWeeks(sessions), [sessions]);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = React.useRef(null);

  const activeWeek = (selectedWeek && weeks.some((w) => w.weekStart === selectedWeek))
    ? selectedWeek
    : (weeks[0] ? weeks[0].weekStart : null);

  const md = useMemo(
    () => (activeWeek ? buildWeekMarkdown(activeWeek, sessions) : ''),
    [activeWeek, sessions],
  );

  if (weeks.length === 0) return null;

  const labelFor = (w) => `${fmtDateShort(w.weekStart)} – ${fmtDateShort(w.weekEnd)} · ${w.count} трен.`;
  const activeMeta = weeks.find((w) => w.weekStart === activeWeek);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      return true;
    } catch (e) {
      if (textareaRef.current) {
        textareaRef.current.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
          return true;
        } catch (e2) { /* ignore */ }
      }
      return false;
    }
  };

  const download = () => {
    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = weekFilename(activeWeek);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (e) {
      // На части мобильных браузеров/Telegram скачивание Blob может не сработать — тогда копируем.
      copy();
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'transparent', border: 'none', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 7 }}>
          <FileDown size={13} /> Экспорт недели в Markdown
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 11 }}>{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div style={{ padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 10, lineHeight: 1.5 }}>
            Отчёт за неделю: результат по каждому упражнению, прогрессия к прошлой неделе и личные рекорды.
            Упражнения и дни из плана, которые не были записаны, помечаются как пропущенные.
          </div>

          {/* Выбор недели */}
          <div style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: 10 }}>
            <button
              onClick={() => setPickerOpen(!pickerOpen)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
                padding: '12px 14px', color: t.TEXT, fontSize: 14.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeMeta ? labelFor(activeMeta) : 'Выбери неделю'}
              </span>
              <span style={{ color: t.TEXT_FAINT, flexShrink: 0, marginLeft: 8 }}>{pickerOpen ? '▲' : '▼'}</span>
            </button>
            {pickerOpen && (
              <>
                <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9, background: 'transparent' }} />
                <div className="dropdown-open" style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
                  background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
                  maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  {weeks.map((w) => {
                    const isSel = w.weekStart === activeWeek;
                    return (
                      <button
                        key={w.weekStart}
                        onClick={() => { setSelectedWeek(w.weekStart); setPickerOpen(false); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
                          background: isSel ? t.ACCENT_BG : 'transparent', border: 'none',
                          borderBottom: `1px solid ${t.BORDER}`, color: isSel ? t.ACCENT_SOFT : t.TEXT,
                          fontSize: 14, fontWeight: isSel ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {labelFor(w)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Предпросмотр (и запасной способ скопировать вручную) */}
          <textarea
            ref={textareaRef}
            readOnly
            value={md}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', height: 140, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8,
              padding: '10px', color: t.TEXT_DIM, fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10, lineHeight: 1.45,
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={download}
              style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <FileDown size={16} /> Скачать .md
            </button>
            <button
              onClick={copy}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${copied ? t.POSITIVE : t.BORDER}`,
                background: copied ? t.POSITIVE : t.BG_INPUT, color: copied ? t.ON_ACCENT : t.TEXT, fontSize: 13.5, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {copied ? <><Check size={15} /> Готово</> : <><Copy size={15} /> Копировать</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
