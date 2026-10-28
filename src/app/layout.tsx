import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Appfinances", template: "%s · Appfinances" },
  description: "Controle e planejamento financeiro pessoal.",
};

// Aplica o tema antes da primeira pintura (evita flash). Lê a mesma chave usada pelo store.
const themeScript = `(function(){try{var p=JSON.parse(localStorage.getItem('appfinances:prefs:v1')||'{}');var m=p.theme||'auto';var d=m==='dark'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
