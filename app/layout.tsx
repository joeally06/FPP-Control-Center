import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import CookieConsent from "@/components/CookieConsent";

// Background services are now initialized in instrumentation.ts

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FPP Light Show Control",
  description: "Control your Falcon Player light shows remotely",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          data-* attributes onto <body> before React hydrates, which otherwise
          triggers a harmless attribute-mismatch warning. */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <Providers>
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
