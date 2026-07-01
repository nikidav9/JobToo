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

        <ScrollViewStyleReset />

        {/* Static splash — same visual as LogoDots (components/EntryTransition.tsx),
            so the pre-hydration screen and the in-app loader read as one screen */}
        <style>{`
          #splash {
            position: fixed; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #fff; z-index: 9999;
            transition: opacity 0.35s ease;
          }
          #splash.hidden { opacity: 0; pointer-events: none; }
          #splash-name {
            font-size: 40px; font-weight: 800; letter-spacing: -1px;
            color: #111111;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          #splash-name span { color: #FF6B1A; }
          #splash-dots {
            display: flex; gap: 8px; margin-top: 22px;
            height: 20px; align-items: flex-end;
          }
          .splash-dot {
            width: 9px; height: 9px; border-radius: 5px;
            animation: splash-bounce 1.04s ease-in-out infinite;
          }
          .splash-dot:nth-child(1) { background: #FF6B1A; animation-delay: 0s; }
          .splash-dot:nth-child(2) { background: #FFB27A; animation-delay: 0.12s; }
          .splash-dot:nth-child(3) { background: #FF8A47; animation-delay: 0.24s; }
          @keyframes splash-bounce {
            0%, 50%, 100% { transform: translateY(0); }
            25% { transform: translateY(-9px); }
          }
        `}</style>
      </head>
      <body>
        <div id="splash">
          <div id="splash-name">Job<span>Too</span></div>
          <div id="splash-dots">
            <div className="splash-dot" />
            <div className="splash-dot" />
            <div className="splash-dot" />
          </div>
        </div>
        {children}
        <script>{`
          (function() {
            var splash = document.getElementById('splash');
            var done = false;

            function finish() {
              if (done) return;
              done = true;
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
