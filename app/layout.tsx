import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/app/_components/AuthProvider";
import MobileBottomNav from "@/app/_components/MobileBottomNav";
import PinGate from "@/app/_components/PinGate";
import NetworkStatusToast from "@/app/_components/NetworkStatusToast";

export const dynamic = "force-dynamic";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paydail - The fastest crypto to Naira conversion",
  description: "We provide swift crypto to naira conversions, and seamless naira withdrawals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-[0px] sm:pb-0`}
      >
        <AuthProvider />
        <NetworkStatusToast />
        <PinGate />
        {children}
        <MobileBottomNav />
      </body>
    </html>
  );
}
