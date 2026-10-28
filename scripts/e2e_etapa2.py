# Teste de fluxo ponta a ponta (opcional). Requer: pip install playwright && playwright install chromium
# Uso: npm run build && npm start -- -p 3112   (em outro terminal)  python scripts/e2e_etapa2.py
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3114"
errors = []
def log(*a): print(*a, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, locale="pt-BR")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Dashboard
    page.goto(BASE + "/dashboard")
    expect(page.get_by_role("heading", level=1)).to_contain_text("Olá, Usuário")
    expect(page.get_by_text("Saldo real das contas")).to_be_visible()
    page.wait_for_timeout(800)
    page.screenshot(path="/tmp/s_dashboard.png", full_page=True)
    log("1 dashboard ok:", page.get_by_role("heading", level=1).inner_text())

    # 2. Extrato: validação
    page.goto(BASE + "/movimentacoes")
    page.get_by_role("button", name="Nova movimentação").click()
    dlg = page.get_by_role("dialog", name="Nova movimentação")
    expect(dlg).to_be_visible()
    dlg.get_by_role("button", name="Salvar").click()
    expect(dlg.get_by_text("Informe um valor válido")).to_be_visible()
    expect(dlg.get_by_text("Informe uma descrição")).to_be_visible()
    expect(dlg.get_by_text("Escolha uma categoria")).to_be_visible()
    log("2 validação ok")

    # 3. Criar despesa
    dlg.get_by_label("Valor (R$)").fill("123,45")
    dlg.get_by_label("Descrição").fill("Teste E2E mercado")
    dlg.get_by_label("Categoria").select_option(label="Alimentação")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_text("Despesa lançada.")).to_be_visible()
    row = page.locator("tbody tr", has_text="Teste E2E mercado")
    expect(row).to_have_count(1)
    expect(row).to_contain_text("123,45")
    log("3 despesa criada ok")

    # 4. Compra parcelada no cartão
    page.get_by_role("button", name="Nova movimentação").click()
    dlg = page.get_by_role("dialog", name="Nova movimentação")
    dlg.get_by_label("Valor (R$)").fill("1000,01")
    dlg.get_by_label("Descrição").fill("Teste TV parcelada")
    dlg.get_by_label("Categoria").select_option(label="Compras")
    dlg.get_by_label("Forma de pagamento").select_option(label="Cartão de crédito")
    dlg.get_by_label("Parcelas").fill("3")
    expect(dlg.get_by_text("3 parcelas:")).to_be_visible()
    dlg.get_by_role("button", name="Salvar").click()
    page.get_by_role("button", name="Filtros").click()
    page.get_by_role("button", name="Todo o histórico").click()
    page.get_by_label("Pesquisar por descrição").fill("tv parcelada")
    expect(page.locator("tbody tr")).to_have_count(3)
    log("4 parcelado ok:", [page.locator("tbody tr").nth(i).inner_text().replace("\n"," | ")[:90] for i in range(3)])

    # 5. Transferência (via Contas)
    page.goto(BASE + "/contas")
    before = page.locator("li", has_text="Poupança (exemplo)").first.inner_text()
    page.get_by_role("button", name="Transferir entre contas").click()
    dlg = page.get_by_role("dialog", name="Nova movimentação")
    dlg.get_by_label("Valor (R$)").fill("100,00")
    dlg.get_by_label("Descrição").fill("Teste transferência")
    dlg.get_by_label("Conta de destino").select_option(label="Poupança (exemplo)")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Transferência registrada.")).to_be_visible()
    after = page.locator("li", has_text="Poupança (exemplo)").first.inner_text()
    log("5 transferência ok. Poupança antes/depois:", before.split("\n")[-1], "→", after.split("\n")[-1])

    # 6. Nova conta
    page.get_by_role("button", name="Nova conta").click()
    dlg = page.get_by_role("dialog", name="Nova conta")
    dlg.get_by_label("Nome da conta").fill("Poupança (exemplo)")
    dlg.get_by_role("button", name="Salvar").click()
    expect(dlg.get_by_text("Você já tem uma conta com esse nome.")).to_be_visible()
    dlg.get_by_label("Nome da conta").fill("Conta E2E")
    dlg.get_by_label("Saldo inicial (R$)").fill("500,00")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.locator("li", has_text="Conta E2E")).to_contain_text("500,00")
    log("6 conta criada ok")

    # 7. Estorno da despesa e conferência do dashboard
    page.goto(BASE + "/movimentacoes")
    page.get_by_label("Pesquisar por descrição").fill("e2e mercado")
    page.get_by_role("button", name="Ver Teste E2E mercado").first.click()
    dlg = page.get_by_role("dialog", name="Movimentação")
    dlg.get_by_role("button", name="Estornar").click()
    dlg.get_by_role("button", name="Estornar").last.click()
    expect(page.get_by_text("Estorno registrado.")).to_be_visible()
    expect(dlg.get_by_text("Estornada").first).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    log("7 estorno ok; linhas:", page.locator("tbody tr").count())

    # 8. Persistência após recarregar
    page.reload()
    page.get_by_role("button", name="Filtros").click()
    page.get_by_role("button", name="Todo o histórico").click()
    page.get_by_label("Pesquisar por descrição").fill("teste")
    n = page.locator("tbody tr").count()
    log("8 após reload, linhas 'teste':", n)
    assert n >= 5, n

    # 9. Mobile
    m = b.new_context(viewport={"width": 390, "height": 800}, locale="pt-BR").new_page()
    m.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
    m.goto(BASE + "/movimentacoes"); m.wait_for_timeout(600)
    m.screenshot(path="/tmp/s_mobile_extrato.png")
    m.goto(BASE + "/dashboard"); m.wait_for_timeout(900)
    m.screenshot(path="/tmp/s_mobile_dashboard.png")
    page.goto(BASE + "/movimentacoes"); page.wait_for_timeout(600)
    page.screenshot(path="/tmp/s_extrato.png", full_page=True)
    log("9 mobile ok")
    b.close()

log("ERROS DE CONSOLE:", errors if errors else "nenhum")
