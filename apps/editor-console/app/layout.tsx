import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vaughan Brief — Editor Console",
  description: "A focused weekly lineup editor for Vaughan Brief.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
