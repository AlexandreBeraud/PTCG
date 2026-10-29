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

