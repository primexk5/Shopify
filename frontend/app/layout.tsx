import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-context";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Worldz Test Shop",
  description: "Test WorldzPayments product checkout and signed NEAR testnet webhooks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <CartProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-500">
            Powered by WorldzPayments &middot; NEAR testnet
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}