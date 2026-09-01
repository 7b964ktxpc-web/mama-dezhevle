import type { ReactNode } from "react";

export const metadata = {
  title: "Мама, тут дешевле! — найдём детское дешевле за вас",
  description: "ИИ ищет по Wildberries, Ozon и Яндекс Маркету, сравнивает цены, скидки и наличие — и показывает лучшие варианты детских товаров.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🛍️%3C/text%3E%3C/svg%3E" />
      </head>
      <body
        style={{
          margin: 0,
          background: "linear-gradient(180deg, #fff7f3 0%, #fffdfb 340px)",
          color: "#2b2118",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.55,
        }}
      >
        {children}
      </body>
    </html>
  );
}
