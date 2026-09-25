import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font at build time. latin-ext covers o', g', sh, ch related glyphs
// and the modifier apostrophes (ʻ ʼ) used in Uzbek Latin.
const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: {
    default: "Bilim sinovi",
    template: "%s | Bilim sinovi",
  },
  description: "O'quv markazlar va maktab filiallari uchun bilim sinash platformasi.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1022" },
  ],
};

// Runs before first paint so the saved theme never flashes the wrong colors.
const THEME_INIT = `try{var t=localStorage.getItem("tp:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={nunito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
