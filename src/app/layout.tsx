export const metadata = {
  title: "Мама, дешевле!",
  description: "ИИ ищет — мама экономит.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
