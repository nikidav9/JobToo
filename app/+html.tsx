import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';
import {
  DRAW_MS, WORD, WORD_LIGHT, LETTER_RISE_MS, LETTER_RISE_EM,
  letterDelay, letterColor,
  WAVE_START_MS, WAVE_PERIOD_MS, WAVE_STAGGER_MS, WAVE_LIFT_EM, WAVE_DIM,
} from '@/constants/splashArt';

// Числа и цвета — те же, что у нативного экрана (components/SplashLoader.tsx):
// оба берут их из constants/splashArt.ts. До этого здесь лежала рукописная
// копия анимации, и комментарий обещал, что она «совпадает один в один» —
// обещание, которое живёт до первой правки в одном из двух файлов.
const letterRules = WORD.split('').map((_, i) => {
  const приход = `animation-delay: ${letterDelay(i)}ms, ${WAVE_START_MS + i * WAVE_STAGGER_MS}ms;`;
  return `#splash-word span:nth-child(${i + 1}) { color: ${letterColor(i)}; ${приход} }`;
}).join('\n          ');

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

        {/* Веб/Telegram Mini App: браузер рисует свою рамку фокуса вокруг полей
            ввода — в нативном приложении её нет, и выглядит она инородно.
            Убираем только подсветку фокуса; собственные рамки полей, заданные
            стилями, не трогаем. */}
        <style>{`
          input, textarea, select, [contenteditable] {
            outline: none !important;
            -webkit-tap-highlight-color: transparent;
          }
          input:focus, textarea:focus, select:focus, [contenteditable]:focus,
          input:focus-visible, textarea:focus-visible {
            outline: none !important;
            box-shadow: none !important;
          }
          /* iOS Safari подсвечивает поле своим фоном при автозаполнении */
          input:-webkit-autofill, textarea:-webkit-autofill {
            -webkit-box-shadow: 0 0 0 1000px transparent inset;
            transition: background-color 9999s ease-out 0s;
          }
        `}</style>

        {/* Загрузочный экран, который видно, пока грузится сам код приложения.
            Тот же, что и в приложении (components/SplashLoader.tsx), числа у
            них общие — см. constants/splashArt.ts. */}
        <style>{`
          #splash {
            position: fixed; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #FF6B1A; z-index: 9999;
            transition: opacity 0.35s ease;
          }
          #splash.hidden { opacity: 0; pointer-events: none; }

          #splash-word {
            /* Размер от ширины экрана, но в разумных краях */
            font-size: clamp(34px, 11vw, 54px);
            line-height: 1;
            font-weight: 800; letter-spacing: -1px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: baseline;
          }
          #splash-word span {
            opacity: 0;
            /* Два движения: разовый приход и бесконечная волна. Задержки у
               каждой буквы свои — они ниже, по номеру. */
            animation:
              sp-rise ${LETTER_RISE_MS}ms cubic-bezier(.22,.61,.36,1) forwards,
              sp-wave ${WAVE_PERIOD_MS}ms ease-in-out infinite;
          }
          @keyframes sp-rise {
            from { opacity: 0; transform: translateY(${LETTER_RISE_EM}em); }
            to   { opacity: 1; transform: none; }
          }
          /* Волна не трогает прозрачность в ноль: приход уже выставил её в
             единицу, и обнулять её здесь значило бы мигать словом. */
          @keyframes sp-wave {
            0%, 100% { opacity: ${WAVE_DIM}; transform: translateY(0); }
            50%      { opacity: 1; transform: translateY(-${WAVE_LIFT_EM}em); }
          }
          ${letterRules}

          /* Счётчик виден с первого кадра — отсчёт начинается с единицы */
          #splash-pct {
            margin-top: 24px; font-size: 17px; font-weight: 700;
            font-style: italic; letter-spacing: 1.5px;
            color: rgba(255,255,255,0.85);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          @media (prefers-reduced-motion: reduce) {
            #splash-word span { animation: none; opacity: 1; }
          }
        `}</style>
      </head>
      <body>
        <div id="splash">
          <div id="splash-word">
            {WORD.split('').map((ch, i) => <span key={i}>{ch}</span>)}
          </div>
          <div id="splash-pct">1%</div>
        </div>
        {children}
        <script>{`
          (function() {
            var splash = document.getElementById('splash');
            var pctEl = document.getElementById('splash-pct');
            var done = false, ready = false, pct = 1;
            var start = Date.now(), DRAW = ${DRAW_MS}, TAIL = 250;

            // 1 → 95 % равномерно, затем 96..99 медленно, и до 100 % когда готово.
            var tick = setInterval(function() {
              if (pct >= 100) { clearInterval(tick); return; }
              if (ready) {
                var left = 100 - pct;
                pct = Math.min(100, pct + (left > 12 ? Math.ceil(left / 8) : 1));
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

            function hide() {
              clearInterval(tick);
              // Полоса браузера была в цвет загрузочного экрана; дальше
              // интерфейс светлый, поэтому возвращаем светлый цвет —
              // иначе сверху висит оранжевая плашка на белом экране
              var tc = document.querySelector('meta[name="theme-color"]');
              if (tc) tc.setAttribute('content', '#F5F7FA');
              if (splash) {
                splash.classList.add('hidden');
                setTimeout(function() { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 400);
              }
            }

            function finish() {
              if (done) return;
              done = true;
              // Не прыгаем на 100 и не прячем сразу: даём счётчику добежать,
              // чтобы 96..99 были видны. Страховка — уходим через 600 мс.
              ready = true;
              var waitFull = setInterval(function() {
                if (pct >= 100) { clearInterval(waitFull); hide(); }
              }, 45);
              setTimeout(function() { clearInterval(waitFull); hide(); }, 600);
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
