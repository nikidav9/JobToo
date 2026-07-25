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
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(34 86)"><g class="pr" style="--dl:660ms"><path d="M 2 44 L 2 16 L 13 4 L 24 16 L 24 44 Z" stroke-width="3"/><path d="M 2 16 L 24 16" stroke-width="2.4"/></g></g>
<g transform="translate(64 100)"><g class="pr" style="--dl:820ms"><path d="M 14 8 A 11 11 0 1 1 13.99 8" stroke-width="3"/><path d="M 14 8 L 16 2" stroke-width="2.4"/><path d="M 16 4 Q 22 1 23 6 Q 18 8 16 4" stroke-width="2.4"/></g></g>
<g transform="translate(94 82)"><g class="pr" style="--dl:980ms"><path d="M 3 48 L 3 22 Q 3 15 7 13 L 7 4 L 15 4 L 15 13 Q 19 15 19 22 L 19 48 Z" stroke-width="3"/><path d="M 7 9 L 15 9" stroke-width="2.4"/></g></g>
<g transform="translate(116 98)"><g class="pr" style="--dl:1140ms"><path d="M 2 32 L 2 4 L 28 4 L 28 32 Z" stroke-width="3"/><path d="M 15 4 L 15 32" stroke-width="2.4"/></g></g>
<g transform="translate(150 102)"><g class="pr" style="--dl:1300ms"><path d="M 4 28 L 2 8 L 20 8 L 18 28 Z" stroke-width="3"/><path d="M 1 5 L 21 5" stroke-width="2.4"/></g></g>
<path class="sp" d="M 26 130 Q 100 121 174 130" stroke-width="3.4" style="--l:150;--d:164ms;--dl:0ms"/>
<path class="sp" d="M 26 130 Q 100 139 174 130" stroke-width="3.4" style="--l:150;--d:164ms;--dl:131ms"/>
<path class="sp" d="M 30 134 L 42 186 Q 43 194 51 194 L 149 194 Q 157 194 158 186 L 170 134" stroke-width="3.4" style="--l:232;--d:295ms;--dl:262ms"/>
<path class="sp" d="M 52 138 L 60 190" stroke-width="2.4" style="--l:53;--d:82ms;--dl:525ms"/>
<path class="sp" d="M 78 136 L 80 192" stroke-width="2.4" style="--l:56;--d:82ms;--dl:558ms"/>
<path class="sp" d="M 122 136 L 120 192" stroke-width="2.4" style="--l:56;--d:82ms;--dl:590ms"/>
<path class="sp" d="M 148 138 L 140 190" stroke-width="2.4" style="--l:53;--d:82ms;--dl:623ms"/>
<path class="sp" d="M 36 156 Q 100 165 164 156" stroke-width="2.4" style="--l:130;--d:82ms;--dl:672ms"/>
<path class="sp" d="M 41 176 Q 100 184 159 176" stroke-width="2.4" style="--l:120;--d:98ms;--dl:722ms"/>
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
