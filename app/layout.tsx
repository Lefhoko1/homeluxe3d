import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "./providers";

import { fontSans } from "@/config/fonts";

export const metadata: Metadata = {
  title: "HomeLuxe 3D - Virtual Furniture Showroom",
  description: "Immersive 3D furniture showroom with virtual tours",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a2332" },
    { media: "(prefers-color-scheme: dark)", color: "#1a2332" },
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
        {/* Load Google Fonts for HomeLuxe */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap"
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
      <body
        className={clsx(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
        )}
        style={{
          margin: 0,
          padding: 0,
          overflow: "hidden", // Prevent scrolling for fullscreen experience
        }}
      >
        <Providers>
          {/* Fullscreen container with no padding or margins */}
          <div className="w-screen h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}