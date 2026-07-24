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
<path class="sp" d="M 12 24 L 118 24" stroke-width="3.4" style="--l:106;--d:92ms;--dl:0ms"/>
<path class="sp" d="M 20 24 L 20 190" stroke-width="3.4" style="--l:166;--d:115ms;--dl:69ms"/>
<path class="sp" d="M 110 24 L 110 190" stroke-width="3.4" style="--l:166;--d:115ms;--dl:115ms"/>
<path class="sp" d="M 12 78 L 118 78" stroke-width="3.4" style="--l:106;--d:92ms;--dl:207ms"/>
<path class="sp" d="M 12 134 L 118 134" stroke-width="3.4" style="--l:106;--d:69ms;--dl:276ms"/>
<path class="sp" d="M 12 190 L 118 190" stroke-width="3.4" style="--l:106;--d:92ms;--dl:322ms"/>
<path class="sp" d="M 24 77 L 24 50 L 34 40 L 44 50 L 44 77 Z" stroke-width="2.8" style="--l:100;--d:115ms;--dl:414ms"/>
<path class="sp" d="M 48 77 L 48 54 L 68 54 L 68 77 Z" stroke-width="2.8" style="--l:86;--d:92ms;--dl:506ms"/>
<path class="sp" d="M 48 62 L 68 62" stroke-width="2.4" style="--l:20;--d:60ms;--dl:598ms"/>
<path class="sp" d="M 74 77 L 72 58 L 86 58 L 84 77 Z" stroke-width="2.8" style="--l:66;--d:69ms;--dl:621ms"/>
<path class="sp" d="M 71 55 L 87 55" stroke-width="2.4" style="--l:16;--d:60ms;--dl:690ms"/>
<path class="sp" d="M 94 77 L 94 60 Q 94 55 97 53 L 97 47 L 103 47 L 103 53 Q 106 55 106 60 L 106 77 Z" stroke-width="2.8" style="--l:78;--d:92ms;--dl:713ms"/>
<path class="sp" d="M 24 133 L 24 108 L 52 108 L 52 133 Z" stroke-width="2.8" style="--l:106;--d:115ms;--dl:782ms"/>
<path class="sp" d="M 38 108 L 38 133" stroke-width="2.4" style="--l:25;--d:60ms;--dl:897ms"/>
<path class="sp" d="M 58 133 L 58 116 L 80 116 L 80 133 Z" stroke-width="2.8" style="--l:78;--d:92ms;--dl:920ms"/>
<path class="sp" d="M 62 116 L 62 100 L 78 100 L 78 116" stroke-width="2.8" style="--l:48;--d:69ms;--dl:1012ms"/>
<path class="sp" d="M 86 133 L 88 108 Q 88 104 92 104 L 104 104 Q 108 104 108 108 L 108 133 Z" stroke-width="2.8" style="--l:92;--d:92ms;--dl:1058ms"/>
<path class="sp" d="M 24 189 L 24 158 L 54 158 L 54 189 Z" stroke-width="2.8" style="--l:122;--d:115ms;--dl:1127ms"/>
<path class="sp" d="M 39 158 L 39 189" stroke-width="2.4" style="--l:31;--d:60ms;--dl:1242ms"/>
<path class="sp" d="M 60 189 L 60 164 L 84 164 L 84 189 Z" stroke-width="2.8" style="--l:98;--d:92ms;--dl:1265ms"/>
<path class="sp" d="M 92 189 L 92 168 Q 92 163 95 161 L 95 155 L 103 155 L 103 161 Q 106 163 106 168 L 106 189 Z" stroke-width="2.8" style="--l:88;--d:92ms;--dl:1334ms"/>
<path class="sp" d="M 118 170 Q 157 162 196 170" stroke-width="3.4" style="--l:80;--d:92ms;--dl:1403ms"/>
<path class="sp" d="M 118 170 Q 157 178 196 170" stroke-width="3.4" style="--l:80;--d:92ms;--dl:1472ms"/>
<path class="sp" d="M 122 174 L 131 219 Q 132 226 139 226 L 175 226 Q 182 226 183 219 L 192 174" stroke-width="3.4" style="--l:148;--d:207ms;--dl:1541ms"/>
<path class="sp" d="M 137 177 L 142 223" stroke-width="2.4" style="--l:46;--d:69ms;--dl:1725ms"/>
<path class="sp" d="M 157 176 L 157 225" stroke-width="2.4" style="--l:49;--d:69ms;--dl:1771ms"/>
<path class="sp" d="M 177 177 L 172 223" stroke-width="2.4" style="--l:46;--d:69ms;--dl:1817ms"/>
<path class="sp" d="M 126 190 Q 157 197 188 190" stroke-width="2.4" style="--l:63;--d:69ms;--dl:1863ms"/>
<path class="sp" d="M 130 207 Q 157 213 184 207" stroke-width="2.4" style="--l:55;--d:69ms;--dl:1909ms"/>
<path class="sp" d="M 116 88 Q 132 82 140 92" stroke-width="2.4" style="--l:30;--d:92ms;--dl:1978ms"/>
<path class="sp" d="M 128 116 L 126 100 L 146 96 L 148 112 Z" stroke-width="2.8" style="--l:72;--d:115ms;--dl:2024ms"/>
<path class="sp" d="M 133 122 Q 138 142 145 158" stroke-width="2.4" style="--l:40;--d:92ms;--dl:2116ms"/>
<path class="sp" d="M 152 90 L 160 84" stroke-width="2.4" style="--l:10;--d:69ms;--dl:2185ms"/>
<path class="sp" d="M 154 108 L 162 104" stroke-width="2.4" style="--l:9;--d:69ms;--dl:2231ms"/>
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
