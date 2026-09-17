import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";
import { hospitalBrand, systemBrand } from "@/lib/branding";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: `${systemBrand.name} - ${systemBrand.subtitle}`,
  description: `${systemBrand.subtitle} untuk ${hospitalBrand.division} ${hospitalBrand.site}`,
  icons: {
    icon: "/images/logo-kotak-awalbros.png?v=3",
    shortcut: "/images/logo-kotak-awalbros.png?v=3",
    apple: "/images/logo-kotak-awalbros.png?v=3"
  },
  manifest: "/manifest.json"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/images/logo-kotak-awalbros.png?v=3" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/images/logo-kotak-awalbros.png?v=3" type="image/png" />
        <link rel="apple-touch-icon" href="/images/logo-kotak-awalbros.png?v=3" />
        {/* Material Symbols is loaded globally; Next font lint rules do not apply to this external icon font. */}
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;

                // 1. Intercept console.error to prevent extension-injected attribute mismatches from popping up Next.js overlay
                try {
                  var _origError = console.error;
                  console.error = function() {
                    var args = Array.prototype.slice.call(arguments);
                    for (var i = 0; i < args.length; i++) {
                      var str = typeof args[i] === 'string' ? args[i] : (args[i] && args[i].message ? args[i].message : '');
                      if (str && (str.indexOf('bis_skin_checked') !== -1 || str.indexOf('bis_register') !== -1)) {
                        return; // Suppress extension hydration mismatch overlay
                      }
                    }
                    return _origError.apply(console, arguments);
                  };
                } catch (e) {}

                // 2. Intercept window error events for extension hydration mismatches
                window.addEventListener('error', function(e) {
                  if (e && e.message && (e.message.indexOf('bis_skin_checked') !== -1 || e.message.indexOf('bis_register') !== -1)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);

                // 3. Active DOM sanitization via MutationObserver
                function strip(el) {
                  if (!el || !el.removeAttribute) return;
                  if (el.hasAttribute && el.hasAttribute('bis_skin_checked')) el.removeAttribute('bis_skin_checked');
                  if (el.hasAttribute && el.hasAttribute('bis_register')) el.removeAttribute('bis_register');
                }

                if (typeof MutationObserver !== 'undefined') {
                  new MutationObserver(function(mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                      var m = mutations[i];
                      if (m.type === 'attributes') {
                        strip(m.target);
                      } else if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                          var node = m.addedNodes[j];
                          if (node.nodeType === 1) {
                            strip(node);
                            if (node.querySelectorAll) {
                              var list = node.querySelectorAll('[bis_skin_checked],[bis_register]');
                              for (var k = 0; k < list.length; k++) strip(list[k]);
                            }
                          }
                        }
                      }
                    }
                  }).observe(document.documentElement, {
                    attributes: true,
                    subtree: true,
                    childList: true,
                    attributeFilter: ['bis_skin_checked', 'bis_register']
                  });
                }
              })();
            `
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
