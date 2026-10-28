"use client";

import "./globals.css";

/** Último recurso: falha tão cedo que nem o layout carregou. Sem detalhes técnicos para o usuário. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-2xl font-semibold">Algo deu errado</h1>
          <p className="max-w-md text-sm text-muted">Não conseguimos abrir o Appfinances. Seus dados salvos não foram apagados. Tente novamente.</p>
          <button type="button" onClick={reset} className="h-10 rounded-lg bg-brand-purple px-4 text-sm font-medium text-on-brand">
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
