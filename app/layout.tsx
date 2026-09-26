import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "@/components/dayflow/dayflow.css";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";

export const metadata: Metadata = {
  title: "DayFlow — Agentic UI Demo",
  description: "Stateful AI interfaces with AG-UI, Zustand, TanStack Query and Gemini",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><QueryProvider>{children}</QueryProvider></body></html>;
}
