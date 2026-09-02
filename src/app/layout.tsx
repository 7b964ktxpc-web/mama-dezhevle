import type { ReactNode } from "react";
import { Golos_Text, Unbounded } from "next/font/google";
import "./globals.css";

const display = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["400", "600", "700"], variable: "--font-unbounded" });
const body = Golos_Text({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-golos" });

export const metadata = {
  title: "Мама, тут дешевле! — найдём детское дешевле за вас",
  description: "ИИ ищет по Wildberries, Ozon и Яндекс Маркету, сравнивает цены, скидки и наличие — и показывает лучшие варианты детских товаров.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%23e8501e'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23fff' font-family='Arial'%3EМ%3C/text%3E%3C/svg%3E" />
      </head>
      <body>{children}</body>
    </html>
  );
}
