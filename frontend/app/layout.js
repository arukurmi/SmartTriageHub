import "./globals.css";

import { ThemeProvider } from '@/components/ThemeProvider';
import { themeInitScript } from '@/lib/theme';

export const metadata = {
  title: "SmartTriageHub Quest Board",
  description: "Gamified GitHub issue triage board powered by AI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Inter:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <div className="page-wrapper">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
