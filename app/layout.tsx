import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic UI",
  description: "Next.js + LangChain + Gemini + AG-UI + A2UI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
