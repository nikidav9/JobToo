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
            белая «нарисованная от руки» корзина на фирменном оранжевом, счётчик
            процентов. Пути и тайминги совпадают с нативной версией один в один,
            поэтому веб/Telegram Mini App и приложение читаются как один экран. */}
        <style>{`
          #splash {
            position: fixed; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #FF6B1A; z-index: 9999;
            transition: opacity 0.35s ease;
          }
          #splash.hidden { opacity: 0; pointer-events: none; }
          #splash-art { width: min(62vw, 34vh); }
          #splash-art svg { width: 100%; height: auto; display: block; }
          .sp {
            fill: none; stroke: #fff;
            stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: var(--l); stroke-dashoffset: var(--l);
            animation: sp-draw var(--d) linear var(--dl) forwards;
          }
          @keyframes sp-draw { to { stroke-dashoffset: 0; } }
          /* Место под логотип зарезервировано всегда — счётчик не подпрыгивает */
          #splash-bottom {
            display: flex; flex-direction: column; align-items: center;
            margin-top: 26px;
          }
          @keyframes sp-fade { to { opacity: 1; } }
          #splash-name {
            font-size: 34px; font-weight: 800; letter-spacing: -0.8px;
            color: #fff; opacity: 0;
            animation: sp-fade 0.5s ease 1265ms forwards;
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
            #splash-name { animation: none; opacity: 1; }
          }
        `}</style>
      </head>
      <body>
        <div id="splash">
          <div
            id="splash-art"
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg">
<path class="sp" d="M 68 148 Q 70 100 100 98 Q 130 100 132 148" stroke-width="3.4" style="--l:136;--d:276ms;--dl:0ms"/>
<path class="sp" d="M 28 150 Q 100 137 172 150" stroke-width="3.4" style="--l:150;--d:276ms;--dl:184ms"/>
<path class="sp" d="M 28 150 Q 100 163 172 150" stroke-width="3.4" style="--l:150;--d:253ms;--dl:322ms"/>
<path class="sp" d="M 34 153 L 55 231 Q 57 240 67 240 L 133 240 Q 143 240 145 231 L 166 153" stroke-width="3.4" style="--l:264;--d:552ms;--dl:414ms"/>
<path class="sp" d="M 60 160 L 70 236" stroke-width="2.6" style="--l:78;--d:207ms;--dl:828ms"/>
<path class="sp" d="M 86 158 L 90 239" stroke-width="2.6" style="--l:82;--d:207ms;--dl:897ms"/>
<path class="sp" d="M 114 158 L 110 239" stroke-width="2.6" style="--l:82;--d:207ms;--dl:966ms"/>
<path class="sp" d="M 140 160 L 130 236" stroke-width="2.6" style="--l:78;--d:207ms;--dl:1035ms"/>
<path class="sp" d="M 44 196 Q 100 205 156 196" stroke-width="2.6" style="--l:116;--d:207ms;--dl:1150ms"/>
<path class="sp" d="M 100 40 A 18 18 0 1 1 99.99 40" stroke-width="3.4" style="--l:114;--d:299ms;--dl:1288ms"/>
<path class="sp" d="M 100 41 L 103 28" stroke-width="2.8" style="--l:14;--d:115ms;--dl:1541ms"/>
<path class="sp" d="M 103 32 Q 115 26 117 36 Q 107 40 103 32 Z" stroke-width="2.8" style="--l:34;--d:138ms;--dl:1610ms"/>
<path class="sp" transform="rotate(-16 46 88)" d="M 38 108 L 36 84 Q 35 77 40 74 L 40 64 L 54 64 L 54 74 Q 59 77 58 84 L 56 108 Q 47 112 38 108 Z" stroke-width="3.4" style="--l:138;--d:345ms;--dl:1426ms"/>
<path class="sp" transform="rotate(-16 46 88)" d="M 40 70 L 54 70" stroke-width="2.8" style="--l:15;--d:92ms;--dl:1725ms"/>
<path class="sp" transform="rotate(14 154 86)" d="M 136 94 Q 134 76 154 74 Q 174 76 172 94 Q 170 104 154 104 Q 138 104 136 94 Z" stroke-width="3.4" style="--l:116;--d:322ms;--dl:1564ms"/>
<path class="sp" transform="rotate(14 154 86)" d="M 145 83 L 151 89" stroke-width="2.6" style="--l:9;--d:115ms;--dl:1840ms"/>
<path class="sp" transform="rotate(14 154 86)" d="M 156 81 L 162 87" stroke-width="2.6" style="--l:9;--d:115ms;--dl:1886ms"/>
<path class="sp" d="M 22 116 L 12 106" stroke-width="2.6" style="--l:15;--d:138ms;--dl:1932ms"/>
<path class="sp" d="M 178 114 L 188 104" stroke-width="2.6" style="--l:15;--d:138ms;--dl:2001ms"/>
<path class="sp" d="M 100 18 L 100 8" stroke-width="2.6" style="--l:11;--d:138ms;--dl:2070ms"/>
<path class="sp" d="M 58 40 L 51 32" stroke-width="2.6" style="--l:11;--d:138ms;--dl:2116ms"/>
<path class="sp" d="M 146 38 L 154 30" stroke-width="2.6" style="--l:11;--d:138ms;--dl:2162ms"/>
</svg>` }}
          />
          <div id="splash-bottom">
            <div id="splash-name">JobToo</div>
            <div id="splash-pct">0%</div>
          </div>
        </div>
        {children}
        <script>{`
          (function() {
            var splash = document.getElementById('splash');
            var pctEl = document.getElementById('splash-pct');
            var done = false, ready = false, pct = 1;
            var start = Date.now(), DRAW = 2300, TAIL = 700;

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
