import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "agent-browser + Next.js",
  description: "Browser automation from Vercel serverless functions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
