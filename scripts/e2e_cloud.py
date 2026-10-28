# Testa o app COMO SE o Firebase estivesse configurado (credenciais falsas): proteção das rotas, formulários e erros de rede.
# NÃO testa login com sucesso, Google, e-mail de verificação nem Firestore (isso exige um projeto Firebase real).
# Uso:
#   NEXT_DIST_DIR=.next-cloud NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo.firebaseapp.com \
#   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:a npm run build
#   NEXT_DIST_DIR=.next-cloud npx next start -p 3120   (em outro terminal)   python scripts/e2e_cloud.py
from playwright.sync_api import sync_playwright, expect
BASE = "http://localhost:3120"
errors = []
def log(*a): print(*a, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1200, "height": 800}, locale="pt-BR").new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text and "Failed to load resource" not in m.text else None)

    # 1. rota privada sem login -> /login
    page.goto(BASE + "/dashboard")
    page.wait_for_url("**/login", timeout=15000)
    log("1 /dashboard sem login redireciona para:", page.url)
    for r in ["/movimentacoes", "/cartoes", "/configuracoes"]:
        page.goto(BASE + r); page.wait_for_url("**/login", timeout=15000)
    log("2 demais rotas privadas também")

    # 3. login real (não desabilitado, sem aviso de indisponível)
    expect(page.get_by_text("Login indisponível nesta versão.")).to_have_count(0)
    expect(page.get_by_label("E-mail")).to_be_enabled()
    page.get_by_role("button", name="Entrar", exact=True).click()
    expect(page.get_by_text("Informe o e-mail.")).to_be_visible()
    expect(page.get_by_text("Informe a senha.")).to_be_visible()
    page.get_by_label("E-mail").fill("pessoa@")
    page.get_by_label("Senha").fill("x")
    page.get_by_role("button", name="Entrar", exact=True).click()
    expect(page.get_by_text("Informe um e-mail válido.")).to_be_visible()
    log("3 validação do login ok")

    # 4. tentativa real com credenciais falsas: erro tratado, sem tela quebrada
    page.get_by_label("E-mail").fill("pessoa@exemplo.com")
    page.get_by_label("Senha").fill("senha-qualquer")
    page.get_by_role("button", name="Entrar", exact=True).click()
    alert = page.locator("form [role=alert]")
    expect(alert).to_be_visible(timeout=20000)
    msg = alert.inner_text()
    assert "TypeError" not in msg and "auth/" not in msg and "Firebase" not in msg, msg
    log("4 falha de login tratada com mensagem amigável:", msg)
    expect(page.get_by_role("button", name="Entrar", exact=True)).to_be_enabled()

    # 5. cadastro valida senha curta e confirmação
    page.goto(BASE + "/cadastro")
    page.get_by_label("E-mail").fill("pessoa@exemplo.com")
    page.get_by_label("Senha", exact=True).fill("1234567")
    page.get_by_label("Confirmar senha").fill("1234567")
    page.get_by_role("button", name="Criar conta", exact=True).click()
    expect(page.get_by_text("Use ao menos 8 caracteres.").first).to_be_visible()
    page.get_by_label("Senha", exact=True).fill("12345678")
    page.get_by_label("Confirmar senha").fill("87654321")
    page.get_by_role("button", name="Criar conta", exact=True).click()
    expect(page.get_by_text("As senhas não são iguais.")).to_be_visible()
    log("5 validação do cadastro ok")

    # 6. recuperar senha: nunca revela se o e-mail existe (mensagem de erro de rede, não de 'usuário')
    page.goto(BASE + "/recuperar-senha")
    page.get_by_label("E-mail").fill("alguem@exemplo.com")
    page.get_by_role("button", name="Enviar link").click()
    page.wait_for_timeout(4000)
    body = page.locator("main").inner_text()
    assert "não encontrado" not in body.lower() and "user-not-found" not in body
    log("6 recuperação não vaza existência de conta")

    # 7. landing aponta para login
    page.goto(BASE + "/")
    expect(page.get_by_role("link", name="Entrar").first).to_be_visible()
    expect(page.get_by_text("Explorar a demonstração")).to_have_count(0)
    log("7 landing no modo nuvem não oferece demonstração")
    b.close()
log("ERROS:", errors if errors else "nenhum")
