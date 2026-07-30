import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import type { Metadata } from "next";
import { Host_Grotesk, Faculty_Glyphic } from "next/font/google";
import "./globals.css";

const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-host-grotesk",
});

const facultyGlyphic = Faculty_Glyphic({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-faculty-glyphic",
});

export const metadata: Metadata = {
  title: "Zegion — Bookmarks",
  description: "Local-first X bookmarks browser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${hostGrotesk.className} ${facultyGlyphic.variable}`}>
        <a href="#viewport" className="skip-link">Skip to content</a>
        <DialRoot defaultOpen />
        {children}
      </body>
    </html>
  );
}
