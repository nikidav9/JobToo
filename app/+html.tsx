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
            логотип JobToo прописывается белой линией на фирменном оранжевом,
            снизу счётчик процентов. Пути и тайминги совпадают с нативной
            версией один в один, поэтому веб/Telegram Mini App и приложение
            читаются как один экран. */}
        <style>{`
          #splash {
            position: fixed; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #FF6B1A; z-index: 9999;
            transition: opacity 0.35s ease;
          }
          #splash.hidden { opacity: 0; pointer-events: none; }
          #splash-art { width: min(72vw, 320px); }
          #splash-art svg { width: 100%; height: auto; display: block; }
          .sp {
            fill: none; stroke: #fff;
            stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: var(--l); stroke-dashoffset: var(--l);
            animation: sp-draw var(--d) linear var(--dl) forwards;
          }
          @keyframes sp-draw { to { stroke-dashoffset: 0; } }
          #splash-bottom {
            display: flex; flex-direction: column; align-items: center;
            margin-top: 22px;
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
          }
        `}</style>
      </head>
      <body>
        <div id="splash">
          <div
            id="splash-art"
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">
<path class="sp" d="M 46 20 L 46 62 Q 46 80 28 80 Q 14 80 12 66" stroke-width="8" style="--l:82;--d:322ms;--dl:0ms"/>
<path class="sp" d="M 74 43 A 18 18 0 1 1 73.99 43" stroke-width="8" style="--l:114;--d:368ms;--dl:299ms"/>
<path class="sp" d="M 104 18 L 104 80" stroke-width="8" style="--l:62;--d:207ms;--dl:644ms"/>
<path class="sp" d="M 104 61 A 18 18 0 1 1 103.99 61" stroke-width="8" style="--l:114;--d:345ms;--dl:828ms"/>
<path class="sp" d="M 150 20 L 192 20" stroke-width="8" style="--l:42;--d:184ms;--dl:1150ms"/>
<path class="sp" d="M 171 20 L 171 80" stroke-width="8" style="--l:60;--d:207ms;--dl:1311ms"/>
<path class="sp" d="M 218 43 A 18 18 0 1 1 217.99 43" stroke-width="8" style="--l:114;--d:345ms;--dl:1495ms"/>
<path class="sp" d="M 262 43 A 18 18 0 1 1 261.99 43" stroke-width="8" style="--l:114;--d:322ms;--dl:1817ms"/>
<path class="sp" d="M 20 98 Q 150 108 282 96" stroke-width="5" style="--l:264;--d:230ms;--dl:2070ms"/>
</svg>` }}
          />
          <div id="splash-bottom">
            <div id="splash-pct">1%</div>
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
