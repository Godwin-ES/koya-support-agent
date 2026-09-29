import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// brand-direction.md: "Preferred options: Inter, System UI font stack" -
// at most three weights (SYSTEM-DESIGN.md §11.2's own limit).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "RelayPay Support",
  description: "Talk to RelayPay support.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        {/* Toasts only for passing confirmations (SYSTEM-DESIGN.md §11.9) - one per action, never the only way something important is communicated. */}
        <Toaster position="bottom-right" richColors={false} />
      </body>
    </html>
  );
}
