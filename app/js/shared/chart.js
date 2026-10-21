// Chart.js, chargé seulement quand une page en a besoin
const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let loading = null;

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHART_JS;
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { loading = null; reject(new Error('Graphique indisponible (pas d’accès à cdnjs)')); };
    document.head.append(s);
  });
  return loading;
}

// Couleurs des parts de camembert, lisibles sur les deux thèmes
export const PALETTE = ['#FF6B5B', '#4FB6FF', '#F2C14E', '#5BD49A', '#B48CFF', '#FF9F43', '#2EC4B6', '#E86FB0', '#8C95A8'];

// Les n plus grosses parts, le reste regroupé dans « Autres »
export function topParts(entries, n = 7) {
  const sorted = [...entries].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= n + 1) return sorted;
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  return [...sorted.slice(0, n), ['Autres', rest]];
}
