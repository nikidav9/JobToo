import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>JobToo</title>
        <meta name="description" content="Подработки на складе в Москве" />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme color */}
        <meta name="theme-color" content="#FF6B1A" />

        {/* iOS Add to Home Screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="JobToo" />
        <link rel="apple-touch-icon" href="/jt-logo.jpg" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* Telegram Mini App SDK — no-op outside Telegram's WebView */}
        <script src="https://telegram.org/js/telegram-web-app.js" />

        <ScrollViewStyleReset />

        {/* Static splash — same visual as the native loader (components/SplashLoader.tsx):
            корзина рисуется белой линией на фирменном оранжевом, в неё плавно
            опускаются продукты, снизу — название и счётчик. Пути и тайминги
            совпадают с нативной версией один в один, поэтому веб/Telegram
            Mini App и приложение читаются как один экран. */}
        <style>{`
          #splash {
            position: fixed; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #FF6B1A; z-index: 9999;
            transition: opacity 0.35s ease;
          }
          #splash.hidden { opacity: 0; pointer-events: none; }
          #splash-art { width: min(62vw, 30vh); }
          #splash-art svg { width: 100%; height: auto; display: block; }
          .sp {
            fill: none; stroke: #fff;
            stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: var(--l); stroke-dashoffset: var(--l);
            animation: sp-draw var(--d) linear var(--dl) forwards;
          }
          @keyframes sp-draw { to { stroke-dashoffset: 0; } }
          /* товары опускаются в корзину */
          .pr { opacity: 0; animation: sp-fall 320ms cubic-bezier(.22,.61,.36,1) var(--dl) forwards; }
          .pr path { fill: none; stroke: #fff; stroke-linecap: round; stroke-linejoin: round; }
          @keyframes sp-fall {
            from { opacity: 0; transform: translateY(-46px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          #splash-bottom {
            display: flex; flex-direction: column; align-items: center;
            margin-top: 24px;
          }
          @keyframes sp-fade { to { opacity: 1; } }
          #splash-name {
            font-size: 32px; font-weight: 800; letter-spacing: -0.8px;
            color: #fff; opacity: 0;
            animation: sp-fade 0.45s ease 940ms forwards;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          /* Счётчик виден с первого кадра — отсчёт начинается с единицы */
          #splash-pct {
            margin-top: 10px; font-size: 17px; font-weight: 700;
            font-style: italic; letter-spacing: 1.5px;
            color: rgba(255,255,255,0.85);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          @media (prefers-reduced-motion: reduce) {
            .sp { animation: none; stroke-dashoffset: 0; }
            .pr { animation: none; opacity: 1; transform: none; }
            #splash-name { animation: none; opacity: 1; }
          }
        `}</style>
      </head>
      <body>
        <div id="splash">
          <div
            id="splash-art"
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(32 60)"><g class="pr" style="--dl:660ms"><path d="M 6 48 L 4 24 Q 3 17 8 14 L 8 4 L 22 4 L 22 14 Q 27 17 26 24 L 24 48 Q 15 52 6 48 Z" transform="rotate(-16 14 28)" stroke-width="3"/><path d="M 8 10 L 22 10" transform="rotate(-16 14 28)" stroke-width="2.4"/></g></g>
<g transform="translate(80 26)"><g class="pr" style="--dl:860ms"><path d="M 20 14 A 18 18 0 1 1 19.99 14" stroke-width="3"/><path d="M 20 15 L 23 2" stroke-width="2.6"/><path d="M 23 6 Q 35 0 37 10 Q 27 14 23 6 Z" stroke-width="2.6"/></g></g>
<g transform="translate(132 72)"><g class="pr" style="--dl:1060ms"><path d="M 4 22 Q 2 4 22 2 Q 42 4 40 22 Q 38 32 22 32 Q 6 32 4 22 Z" transform="rotate(14 22 14)" stroke-width="3"/><path d="M 13 11 L 19 17" transform="rotate(14 22 14)" stroke-width="2.4"/><path d="M 24 9 L 30 15" transform="rotate(14 22 14)" stroke-width="2.4"/></g></g>
<path class="sp" d="M 68 148 Q 70 100 100 98 Q 130 100 132 148" stroke-width="3.4" style="--l:136;--d:115ms;--dl:0ms"/>
<path class="sp" d="M 28 150 Q 100 137 172 150" stroke-width="3.4" style="--l:150;--d:115ms;--dl:98ms"/>
<path class="sp" d="M 28 150 Q 100 163 172 150" stroke-width="3.4" style="--l:150;--d:98ms;--dl:197ms"/>
<path class="sp" d="M 34 153 L 55 231 Q 57 240 67 240 L 133 240 Q 143 240 145 231 L 166 153" stroke-width="3.4" style="--l:264;--d:262ms;--dl:279ms"/>
<path class="sp" d="M 60 160 L 70 236" stroke-width="2.4" style="--l:78;--d:74ms;--dl:517ms"/>
<path class="sp" d="M 86 158 L 90 239" stroke-width="2.4" style="--l:82;--d:74ms;--dl:549ms"/>
<path class="sp" d="M 114 158 L 110 239" stroke-width="2.4" style="--l:82;--d:74ms;--dl:582ms"/>
<path class="sp" d="M 140 160 L 130 236" stroke-width="2.4" style="--l:78;--d:74ms;--dl:615ms"/>
<path class="sp" d="M 44 196 Q 100 205 156 196" stroke-width="2.4" style="--l:116;--d:148ms;--dl:672ms"/>
<path class="sp" d="M 22 116 L 12 106" stroke-width="2.6" style="--l:15;--d:78ms;--dl:1400ms"/>
<path class="sp" d="M 178 114 L 188 104" stroke-width="2.6" style="--l:15;--d:78ms;--dl:1439ms"/>
<path class="sp" d="M 100 18 L 100 8" stroke-width="2.6" style="--l:11;--d:78ms;--dl:1478ms"/>
<path class="sp" d="M 58 40 L 51 32" stroke-width="2.6" style="--l:11;--d:78ms;--dl:1517ms"/>
<path class="sp" d="M 146 38 L 154 30" stroke-width="2.6" style="--l:11;--d:104ms;--dl:1556ms"/>
</svg>` }}
          />
          <div id="splash-bottom">
            <div id="splash-name">JobToo</div>
            <div id="splash-pct">1%</div>
          </div>
        </div>
        {children}
        <script>{`
          (function() {
            var splash = document.getElementById('splash');
            var pctEl = document.getElementById('splash-pct');
            var done = false, ready = false, pct = 1;
            var start = Date.now(), DRAW = 1700, TAIL = 320;

            // 1 → 95 % равномерно, затем 96..99 медленно, и до 100 % когда готово.
            var tick = setInterval(function() {
              if (pct >= 100) { clearInterval(tick); return; }
              if (ready) {
                pct = Math.min(100, pct + 7);
              } else {
                var elapsed = Date.now() - start;
                if (elapsed < DRAW) {
                  pct = Math.max(pct, Math.round(1 + (elapsed / DRAW) * 94));
                } else {
                  pct = Math.max(pct, Math.min(99, 95 + Math.floor((elapsed - DRAW) / TAIL)));
                }
              }
              if (pctEl) pctEl.textContent = pct + '%';
            }, 45);

            function finish() {
              if (done) return;
              done = true;
              ready = true;
              if (pctEl) pctEl.textContent = '100%';
              clearInterval(tick);
              if (splash) {
                splash.classList.add('hidden');
                setTimeout(function() { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 400);
              }
            }

            // The app hides the splash itself once data is loaded
            // (EntryTransition / index.tsx call window.__hideSplash).
            window.__hideSplash = finish;

            // Failsafe: never trap the user if the app fails to signal
            setTimeout(finish, 12000);
          })();
        `}</script>
      </body>
    </html>
  );
}
