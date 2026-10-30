// Theme presets, accent colors, fonts and the function that applies them to the page.

// Each preset tints the neutral surfaces and brings a matching default accent.
// [bg, surface, surface-2, border, border-strong]
export const PRESETS = {
  evenday: { label: 'Evenday', accent: 'teal', light: ['#f6f6f3', '#ffffff', '#f0f1ed', '#e4e5e0', '#d0d3cc'], dark: ['#111413', '#1a1e1c', '#232826', '#2a302d', '#3a413e'] },
  paper: { label: 'Paper', accent: 'orange', light: ['#f5f1ea', '#fffdf8', '#efe9df', '#e6dfd2', '#d4cbbb'], dark: ['#16140f', '#201d17', '#2a261f', '#332e26', '#453f35'] },
  ocean: { label: 'Ocean', accent: 'blue', light: ['#eef4f8', '#ffffff', '#e4edf3', '#d9e4ec', '#c4d3de'], dark: ['#0d1419', '#151f26', '#1d2a33', '#24333d', '#33454f'] },
  forest: { label: 'Forest', accent: 'green', light: ['#f0f4ef', '#ffffff', '#e5ece3', '#dbe4d8', '#c6d2c2'], dark: ['#0f1410', '#171e18', '#1f2820', '#263127', '#344236'] },
  lavender: { label: 'Lavender', accent: 'violet', light: ['#f4f2fa', '#ffffff', '#ebe7f5', '#e2ddf0', '#cfc8e6'], dark: ['#131119', '#1c1924', '#25212f', '#2d2838', '#3d364b'] },
  blush: { label: 'Blush', accent: 'pink', light: ['#faf2f3', '#ffffff', '#f3e6e8', '#eddadd', '#e0c6ca'], dark: ['#181113', '#22191b', '#2c2124', '#34272a', '#47363a'] },
  sunset: { label: 'Sunset', accent: 'red', light: ['#fbf3ec', '#ffffff', '#f5e7da', '#efdccb', '#e3c8b2'], dark: ['#1a120d', '#241914', '#2f221b', '#392a21', '#4c392d'] },
  midnight: { label: 'Midnight', accent: 'indigo', light: ['#f1f2f8', '#ffffff', '#e7e9f3', '#dcdfee', '#c8cce3'], dark: ['#0b0d17', '#131628', '#1b1f35', '#232843', '#323858'] },
  slate: { label: 'Slate', accent: 'graphite', light: ['#f3f4f6', '#ffffff', '#e9ebee', '#e0e3e7', '#cbd0d6'], dark: ['#111214', '#1a1b1e', '#232529', '#2b2d31', '#3a3d42'] },
};

// [light-mode accent, dark-mode accent]
export const ACCENTS = {
  teal: ['#0f7a70', '#4bb8aa'], mint: ['#13806a', '#3fc8a4'], green: ['#2f7d3a', '#62b56e'], sky: ['#0a73a8', '#4fb3e6'],
  blue: ['#2563a8', '#5aa2e6'], indigo: ['#4650c8', '#8c95f5'], violet: ['#6a4fc8', '#a08ff0'], pink: ['#b8436a', '#e889a8'],
  red: ['#c23a32', '#f07a6e'], orange: ['#b4541a', '#ec9152'], amber: ['#94650a', '#e0b048'], graphite: ['#3f4650', '#c3c9d1'],
};

export const FONTS = {
  system: { label: 'Default', stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  rounded: { label: 'Rounded', stack: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", -apple-system, system-ui, sans-serif' },
  serif: { label: 'Serif', stack: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Times New Roman", serif' },
  mono: { label: 'Mono', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
};

export const TEXT_SIZES = { s: ['Small', 0.92], m: ['Default', 1], l: ['Large', 1.1], xl: ['Extra large', 1.22] };

export const isDark = (prefs) => prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

export function applyAppearance(prefs) {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  const dark = isDark(prefs);
  const preset = PRESETS[prefs.preset] || PRESETS.evenday;
  let [bg, surface, surface2, border, borderStrong] = dark ? preset.dark : preset.light;
  if (dark && prefs.trueBlack) [bg, surface, surface2, border, borderStrong] = ['#000000', '#121212', '#1c1c1e', '#262628', '#38383a'];
  const accent = (ACCENTS[prefs.accent] || ACCENTS.teal)[dark ? 1 : 0];
  const vars = {
    '--bg': bg, '--surface': surface, '--surface-2': surface2, '--border': border, '--border-strong': borderStrong,
    '--accent': accent,
    '--accent-hover': `color-mix(in srgb, ${accent} 86%, ${dark ? '#fff' : '#000'})`,
    '--accent-soft': `color-mix(in srgb, ${accent} ${dark ? 22 : 13}%, ${surface})`,
    '--on-accent': dark ? '#0b0f0e' : '#ffffff',
    '--t-teal': accent,
    '--font': FONTS[prefs.font]?.stack || FONTS.system.stack,
    '--font-display': FONTS[prefs.font]?.stack || FONTS.system.stack,
    '--zoom': String(TEXT_SIZES[prefs.textSize]?.[1] || 1),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.radius = prefs.radius;
  root.dataset.density = prefs.density;
  root.dataset.motion = prefs.motion;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
