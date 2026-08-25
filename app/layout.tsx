import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "./providers";

import { fontSans } from "@/config/fonts";

export const metadata: Metadata = {
  // Says what it IS. "Immersive 3D experiences" could be about anything, and
  // this is the line that appears in a search result and in a shared link.
  title: {
    default: "HomeLuxe 3D — walk through a furnished house",
    template: "%s · HomeLuxe 3D",
  },
  description:
    "A virtual house furnished with real products from Gaborone shops. " +
    "Walk through it room by room, see furniture at its own size, and ask " +
    "the shop about anything in it.",
};

export const viewport: Viewport = {
  themeColor: [
    // The browser chrome matches the page, which is paper now rather than
    // the navy this was written against.
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#17212E" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        {/*
          The site's two faces, linked here rather than @imported from CSS.

          An @import inside a stylesheet cannot start downloading until that
          stylesheet has itself arrived and been parsed, so the fonts queue up
          behind the CSS instead of alongside it. A <link> in the head starts
          both at once. Preconnecting to the font host saves the DNS and TLS
          round trip on top of that.

          These were Inter and Playfair Display, which the site stopped using
          when it was rethemed -- so every page was downloading two typefaces
          it never rendered a character in.
        */}
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Archivo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/*
          Three.js is NOT loaded from a CDN here.

          It comes from npm (`three` + `three-stdlib`) and is imported by the
          components that need it. The r128 CDN tags that used to sit here
          were left over from the standalone public/homeluxe-3d.html page.
          They loaded a second, older copy of the library into every page,
          which produced "THREE.WARNING: Multiple instances of Three.js being
          imported" and blocked first render on five synchronous scripts.
        */}
      </head>
      {/*
        THE PAGE SCROLLS. It did not, and the reason is worth keeping: when
        this was written `/` WAS the showroom, a 3D canvas in a 100vh grid
        that must never move, so scrolling was switched off here -- on the
        <body>, for the whole site -- and every page was locked into one
        screen with the rest of its content clipped away below the fold.

        There are five pages now and four of them are ordinary documents.
        The front page, /join, /following and /admin all run past the bottom
        of the viewport by design.

        So the rule goes back where it belongs: the showroom locks scrolling
        itself, while it is on screen, and puts it back when you leave. A
        page that must not scroll is one page's business, not the layout's.
      */}
      <body
        className={clsx(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
        )}
        style={{ margin: 0, padding: 0 }}
      >
        <Providers>
          {/* Full width, and at LEAST the viewport tall -- `h-screen` was
              exactly the viewport tall, which is a different thing: it made
              the box that clipped everything below it. */}
          <div className="w-full min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}