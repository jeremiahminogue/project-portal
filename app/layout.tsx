import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Portal — Pueblo Electric",
  description:
    "Customer-facing project coordination portal. Files, schedule, submittals, chat.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://rsms.me/"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="min-h-screen surface-subtle">{children}</body>
    </html>
  );
}
