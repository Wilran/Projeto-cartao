import "./globals.css";

export const metadata = {
  title: "Painel financeiro",
  description: "Painel de finanças pessoais",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
