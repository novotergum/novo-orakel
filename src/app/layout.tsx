import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UT Orakel – WM Tippspiel",
  description: "WM Tippspiel Leaderboard – United Therapy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#F7F5F3",
          color: "#3A3A3A",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
