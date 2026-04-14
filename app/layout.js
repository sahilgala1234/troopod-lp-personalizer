import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Troopod LP Personalizer — AI-Powered Landing Page Optimization",
  description:
    "Match your landing page to your ad creative in seconds. Powered by Gemini AI for CRO-focused personalization.",
  openGraph: {
    title: "Troopod LP Personalizer",
    description: "AI-powered landing page personalization aligned to your ad creative",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="app-wrapper">{children}</body>
    </html>
  );
}
