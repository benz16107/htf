import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { FloatingQaChatbot } from "@/components/FloatingQaChatbot";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PENTAGON — Supply chain risk, decoded",
  description:
    "Signal detection, impact analysis, and autonomous mitigation. One platform for supply chain risk intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,-25..200"
        />
      </head>
      <body className={`${roboto.variable} ${robotoMono.variable} app-body`} suppressHydrationWarning>
        {children}
        <FloatingQaChatbot />
      </body>
    </html>
  );
}
