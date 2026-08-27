import type { ReactNode } from "react";

export const metadata = {
  title: "Мама, дешевле!",
  description: "ИИ ищет — мама экономит. Выгодные детские товары по лучшим ценам.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          background: "#fff7f3",
          color: "#2b2118",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
