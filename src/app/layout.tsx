import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Five Nights at the Forest",
  description: "Web3 P2E survival horror on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
