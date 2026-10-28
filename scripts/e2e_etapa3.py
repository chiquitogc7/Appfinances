# Teste ponta a ponta da Etapa 3 (opcional). Requer: pip install playwright && playwright install chromium
# Uso: npm run build && npm start -- -p 3114   (em outro terminal)  python scripts/e2e_etapa3.py
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

    # ---- Cartões
    page.goto(BASE + "/cartoes")
    expect(page.get_by_role("heading", level=1)).to_have_text("Cartões")
    panel = page.locator("section", has=page.get_by_role("heading", name="Cartão Roxo (exemplo)", level=2))
    expect(panel).to_be_visible()
    log("1 cartões carregam:", panel.locator("h2").inner_text())

    # novo cartão com validação
    page.get_by_role("button", name="Novo cartão").click()
    dlg = page.get_by_role("dialog", name="Novo cartão")
    dlg.get_by_role("button", name="Salvar").click()
    expect(dlg.get_by_text("Informe o nome do cartão.")).to_be_visible()
    dlg.get_by_label("Nome do cartão").fill("Cartão E2E")
    dlg.get_by_label("Instituição ou emissor").fill("Banco Teste")
    dlg.get_by_label("Limite total (R$)").fill("2.000,00")
    dlg.get_by_label("Dia de fechamento").fill("20")
    dlg.get_by_label("Dia de vencimento").fill("28")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Cartão cadastrado.")).to_be_visible()
    expect(page.get_by_role("heading", name="Cartão E2E", level=2)).to_be_visible()
    log("2 cartão criado ok")

    # compra no cartão novo (parcelada 4x) pelo extrato
    page.goto(BASE + "/movimentacoes")
    page.get_by_role("button", name="Nova movimentação").click()
    dlg = page.get_by_role("dialog", name="Nova movimentação")
    dlg.get_by_label("Valor (R$)").fill("1.000,00")
    dlg.get_by_label("Descrição").fill("Compra E2E 4x")
    dlg.get_by_label("Categoria").select_option(label="Compras")
    dlg.get_by_label("Forma de pagamento").select_option(label="Cartão de crédito")
    dlg.get_by_label("Cartão", exact=True).select_option(label="Cartão E2E")
    dlg.get_by_label("Parcelas").fill("4")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    log("3 compra 4x no cartão novo ok")

    # ---- fatura: ajuste e pagamento parcial/total
    page.goto(BASE + "/cartoes")
    cp = page.locator("section", has=page.get_by_role("heading", name="Cartão E2E", level=2))
    first = cp.locator("ul.divide-y > li").first
    before_text = first.inner_text().replace("\n", " | ")
    log("4 primeira fatura:", before_text[:120])
    first.get_by_role("button", name="Juros, multa ou reembolso").click()
    dlg = page.get_by_role("dialog", name="Ajuste na fatura")
    dlg.get_by_label("Valor (R$)").fill("12,50")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Juros lançados na fatura.")).to_be_visible()
    first = cp.locator("ul.divide-y > li").first
    expect(first).to_contain_text("262,50")  # 250,00 + 12,50
    log("5 juros ok")

    first.get_by_role("button", name="Juros, multa ou reembolso").click()
    dlg = page.get_by_role("dialog", name="Ajuste na fatura")
    dlg.get_by_role("radio", name="Reembolso").click()
    dlg.get_by_label("Valor (R$)").fill("50,00")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Reembolso lançado na fatura.")).to_be_visible()
    expect(cp.locator("ul.divide-y > li").first).to_contain_text("212,50")
    log("6 reembolso ok")

    cp.locator("ul.divide-y > li").first.get_by_role("button", name="Pagar fatura").click()
    dlg = page.get_by_role("dialog", name="Pagar fatura")
    dlg.get_by_label("Valor (R$)").fill("300,00")
    dlg.get_by_role("button", name="Registrar pagamento").click()
    expect(dlg.get_by_text("O valor é maior que o saldo da fatura")).to_be_visible()
    dlg.get_by_label("Valor (R$)").fill("100,00")
    dlg.get_by_role("button", name="Registrar pagamento").click()
    expect(page.get_by_text("Pagamento parcial registrado")).to_be_visible()
    expect(cp.locator("ul.divide-y > li").first).to_contain_text("112,50")
    log("7 pagamento parcial ok (restante 112,50)")

    # antecipar parcelas
    cp.get_by_role("button", name="Antecipar parcelas").click()
    dlg = page.get_by_role("dialog", name="Antecipar parcelas — Cartão E2E")
    dlg.get_by_role("button", name="Antecipar").click()
    expect(dlg.get_by_text("Escolha ao menos uma parcela.")).to_be_visible()
    dlg.get_by_label("Parcela 4/4", exact=False).check()
    dlg.get_by_role("button", name="Antecipar").click()
    expect(page.get_by_text("Parcelas antecipadas.")).to_be_visible()
    log("8 antecipação ok")

    # ---- Planejamento
    page.goto(BASE + "/planejamento")
    expect(page.get_by_role("heading", name="Planejamento", level=1)).to_be_visible()
    page.get_by_role("button", name="Novo orçamento").click()
    dlg = page.get_by_role("dialog", name="Novo orçamento")
    dlg.get_by_label("Categoria").select_option(label="Viagens")
    dlg.get_by_label("Limite mensal (R$)").fill("500,00")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Orçamento salvo.")).to_be_visible()
    expect(page.get_by_text("Viagens").first).to_be_visible()
    log("9 orçamento ok")

    page.get_by_role("button", name="Nova meta").click()
    dlg = page.get_by_role("dialog", name="Nova meta")
    dlg.get_by_role("button", name="Salvar").click()
    expect(dlg.get_by_text("Informe o nome da meta.")).to_be_visible()
    dlg.get_by_label("Nome da meta").fill("Meta E2E")
    dlg.get_by_label("Valor-alvo (R$)").fill("1.200,00")
    dlg.get_by_label("Prazo").fill("2027-10-25")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Meta salva.")).to_be_visible()
    li = page.locator("li", has_text="Meta E2E").first
    expect(li).to_contain_text("guardar")
    li.get_by_role("button", name="Registrar aporte").click()
    dlg = page.get_by_role("dialog", name="Aporte em Meta E2E")
    dlg.get_by_label("Valor (R$)").fill("200,00")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Aporte registrado.")).to_be_visible()
    expect(page.locator("li", has_text="Meta E2E").first).to_contain_text("200,00")
    log("10 meta + aporte ok")

    page.get_by_role("button", name="Nova recorrência").click()
    dlg = page.get_by_role("dialog", name="Nova recorrência")
    dlg.get_by_label("Valor (R$)").fill("39,90")
    dlg.get_by_label("Descrição").fill("Assinatura E2E")
    dlg.get_by_label("Categoria").select_option(label="Assinaturas")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Recorrência criada.")).to_be_visible()
    recp = page.locator("section", has=page.get_by_role("heading", name="Recorrências", level=2))
    rec = recp.locator("li", has_text="Assinatura E2E").first
    expect(rec).to_contain_text("Mensal")
    log("11 recorrência criada:", rec.inner_text().replace("\n", " | ")[:100])

    # previstos gerados no extrato
    page.goto(BASE + "/movimentacoes")
    page.get_by_role("button", name="Filtros").click()
    page.get_by_role("button", name="Todo o histórico").click()
    page.get_by_label("Pesquisar por descrição").fill("assinatura e2e")
    n = page.locator("tbody tr").count()
    log("12 ocorrências no extrato:", n)
    assert n >= 12, n

    # encerrar
    page.goto(BASE + "/planejamento")
    recp = page.locator("section", has=page.get_by_role("heading", name="Recorrências", level=2))
    rec = recp.locator("li", has_text="Assinatura E2E").first
    rec.get_by_role("button", name="Encerrar").click()
    rec.get_by_role("button", name="Confirmar encerramento").click()
    expect(page.get_by_text("Recorrência encerrada.")).to_be_visible()
    expect(recp.locator("li", has_text="Assinatura E2E").first).to_contain_text("Encerrada")
    log("13 recorrência encerrada")

    # persistência
    page.reload()
    expect(page.locator("li", has_text="Meta E2E").first).to_be_visible()
    expect(page.locator("section", has=page.get_by_role("heading", name="Recorrências", level=2)).locator("li", has_text="Assinatura E2E").first).to_contain_text("Encerrada")
    page.goto(BASE + "/cartoes")
    expect(page.get_by_role("heading", name="Cartão E2E", level=2)).to_be_visible()
    log("14 persistência após reload ok")

    page.goto(BASE + "/dashboard"); page.wait_for_timeout(900)
    page.screenshot(path="/tmp/e3_dash.png", full_page=True)
    page.goto(BASE + "/cartoes"); page.wait_for_timeout(500)
    page.screenshot(path="/tmp/e3_cartoes.png", full_page=True)
    page.goto(BASE + "/planejamento"); page.wait_for_timeout(900)
    page.screenshot(path="/tmp/e3_plan.png", full_page=True)
    m = b.new_context(viewport={"width": 390, "height": 800}, locale="pt-BR").new_page()
    m.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
    m.goto(BASE + "/cartoes"); m.wait_for_timeout(600); m.screenshot(path="/tmp/e3_m_cartoes.png")
    m.goto(BASE + "/planejamento"); m.wait_for_timeout(900); m.screenshot(path="/tmp/e3_m_plan.png")
    b.close()

log("ERROS DE CONSOLE:", errors if errors else "nenhum")
