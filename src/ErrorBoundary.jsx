import React from 'react';
import { tr } from './i18n.js';

// Ошибка при отрисовке раньше снимала всё дерево React — в Telegram оставался
// пустой экран без объяснений. Теперь — короткое сообщение и перезапуск.
// Данные в базе это не трогает, черновик пошаговой тренировки лежит на
// устройстве и после перезапуска предлагается продолжить.
// Цвета — те же, что у таб-бара (тема 2A): хук темы в классе недоступен.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    try { console.error('render error', error, info && info.componentStack); } catch (e) { /* no-op */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', boxSizing: 'border-box', padding: '48px 24px', background: '#0A0A0A',
        color: '#EDE6D6', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{tr('Что-то пошло не так')}</div>
        <div style={{ fontSize: 13.5, color: '#8F897C', maxWidth: 320, lineHeight: 1.5 }}>
          {tr('Данные и черновик тренировки на месте. Перезапусти экран — если повторится, напиши об этом.')}
        </div>
        <button
          onClick={() => { try { window.location.reload(); } catch (e) { /* no-op */ } }}
          style={{
            marginTop: 6, padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: '#E4C57E', color: '#0A0A0A', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {tr('Перезапустить')}
        </button>
      </div>
    );
  }
}
