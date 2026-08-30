import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Faculty_Glyphic, DM_Mono } from "next/font/google";
import "./globals.css";

const offgridSans = localFont({
  src: [
    { path: "../assets/Offgrid/OffgridSans-Light.woff2", weight: "300" },
    { path: "../assets/Offgrid/OffgridSans-Regular.woff2", weight: "400" },
    { path: "../assets/Offgrid/OffgridSans-Medium.woff2", weight: "500" },
    { path: "../assets/Offgrid/OffgridSans-SemiBold.woff2", weight: "600" },
    { path: "../assets/Offgrid/OffgridSans-Bold.woff2", weight: "700" },
    { path: "../assets/Offgrid/OffgridSans-ExtraBold.woff2", weight: "800" },
  ],
  variable: "--font-offgrid-sans",
  display: "swap",
});

const facultyGlyphic = Faculty_Glyphic({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-faculty-glyphic",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
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
      <body className={`${offgridSans.className} ${facultyGlyphic.variable} ${dmMono.variable}`}>
        <a href="#viewport" className="skip-link">Skip to content</a>
        <DialRoot defaultOpen />
        {children}
      </body>
    </html>
  );
}
