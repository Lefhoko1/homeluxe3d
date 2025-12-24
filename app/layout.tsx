import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { fontSans } from "@/config/fonts";
import clsx from "clsx";

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
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
          <div className="w-screen h-screen">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}