import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/cart-context";
import { Nav } from "@/components/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quai Shop",
  description: "Buy Quai Network merch. Pay with crypto, straight to your wallet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <CartProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-500">
            Powered by Quai Network &middot; payments via PayWithQuai
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}