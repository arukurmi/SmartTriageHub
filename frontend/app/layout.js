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
