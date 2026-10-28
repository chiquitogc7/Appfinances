# Teste ponta a ponta da Etapa 4 (opcional). Requer: pip install playwright && playwright install chromium
# Uso: npm run build && npm start -- -p 3114   (em outro terminal)  python scripts/e2e_etapa4.py
import json, re
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3114"
errors = []
def log(*a): print(*a, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, locale="pt-BR", accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---- Patrimônio
    page.goto(BASE + "/patrimonio")
    expect(page.get_by_role("heading", name="Patrimônio", level=1)).to_be_visible()
    total_before = page.locator("section[aria-label='Patrimônio total'] p").nth(1).inner_text()
    log("1 patrimônio total:", total_before)
    page.get_by_role("button", name="Novo ativo").click()
    dlg = page.get_by_role("dialog", name="Novo ativo")
    dlg.get_by_role("button", name="Salvar").click()
    expect(dlg.get_by_text("Informe o nome do ativo.")).to_be_visible()
    dlg.get_by_label("Nome do ativo").fill("Ativo E2E")
    dlg.get_by_label("Valor aplicado (R$)").fill("1.000,00")
    dlg.get_by_label("Valor atual (R$)").fill("1.100,00")
    dlg.get_by_role("button", name="Salvar").click()
    expect(page.get_by_text("Ativo registrado.")).to_be_visible()
    row = page.locator("li", has_text="Ativo E2E").first
    expect(row).to_contain_text("1.100,00")
    expect(row).to_contain_text("10")  # +10%
    total_after = page.locator("section[aria-label='Patrimônio total'] p").nth(1).inner_text()
    assert total_after != total_before, (total_before, total_after)
    log("2 ativo criado; total:", total_after)

    page.get_by_role("button", name="Editar Ativo E2E").click()
    dlg = page.get_by_role("dialog", name="Editar ativo")
    dlg.get_by_label("Valor atual (R$)").fill("1.200,00")
    dlg.get_by_role("button", name="Salvar alterações").click()
    expect(page.get_by_text("Ativo atualizado.")).to_be_visible()
    expect(page.locator("li", has_text="Ativo E2E").first).to_contain_text("2 atualizações")
    page.get_by_role("button", name="Arquivar Ativo E2E").click()
    expect(page.locator("li", has_text="Ativo E2E")).to_have_count(0)
    page.get_by_role("button", name=re.compile("Mostrar ativos arquivados")).click()
    page.get_by_role("button", name="Restaurar").click()
    expect(page.get_by_text("Ativo restaurado.")).to_be_visible()
    log("3 editar/arquivar/restaurar ok")

    # ---- Relatórios
    page.goto(BASE + "/relatorios")
    expect(page.get_by_role("heading", name="Relatórios", level=1)).to_be_visible()
    for tab in ["Receitas e despesas", "Gastos por categoria", "Evolução do saldo", "Orçamentos", "Parcelas e compromissos", "Patrimônio"]:
        page.get_by_role("tab", name=tab).click()
        page.wait_for_timeout(250)
        assert page.locator("table").count() >= 1, tab
    log("4 seis relatórios renderizam")

    page.get_by_role("tab", name="Gastos por categoria").click()
    page.get_by_role("button", name="Últimos 3 meses").click()
    page.get_by_label("Categoria").select_option(label="Moradia")
    rows = page.locator("tbody tr")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text("Moradia")
    log("5 filtro por categoria ok")
    page.get_by_label("Categoria").select_option(label="Todas as categorias")
    page.get_by_label("Conta ou cartão").select_option(label="Cartão Laranja (exemplo)")
    n_card = page.locator("tbody tr").count()
    log("   categorias no Cartão Laranja:", n_card)
    page.get_by_label("Conta ou cartão").select_option(label="Todas as contas e cartões")

    page.get_by_role("tab", name="Receitas e despesas").click()
    with page.expect_download() as dl:
        page.get_by_role("button", name="CSV").click()
    path = dl.value.path()
    raw = open(path, "rb").read()
    text = raw.decode("utf-8")
    assert raw.startswith(b"\xef\xbb\xbf"), "sem BOM"
    lines = text.strip().split("\r\n")
    log("6 CSV:", dl.value.suggested_filename, "|", lines[0][:60], "|", lines[-1][:50], "| linhas:", len(lines))
    assert lines[0].startswith("\ufeffMês;Receitas realizadas") and lines[-1].startswith("Total;")
    expect(page.get_by_role("button", name=re.compile("XLSX"))).to_be_disabled()
    expect(page.get_by_role("button", name=re.compile("PDF"))).to_be_disabled()
    log("7 XLSX/PDF desabilitados com aviso")

    # ---- Configurações
    page.goto(BASE + "/configuracoes")
    page.get_by_label("Nova categoria").fill("Presentes")
    page.get_by_role("button", name="Adicionar").click()
    expect(page.get_by_text("Categoria criada.")).to_be_visible()
    page.get_by_label("Nova categoria").fill("alimentação")
    page.get_by_role("button", name="Adicionar").click()
    expect(page.get_by_text("Já existe uma categoria com esse nome.")).to_be_visible()
    page.get_by_role("button", name="Renomear Presentes").click()
    page.get_by_label("Nome", exact=True).fill("Presentes e festas")
    page.get_by_role("button", name="Salvar nome").click()
    expect(page.get_by_text("Categoria renomeada.")).to_be_visible()
    expect(page.get_by_text("Presentes e festas")).to_be_visible()
    # categoria padrão não tem botão de remover
    expect(page.get_by_role("button", name="Remover Moradia")).to_have_count(0)
    log("8 categorias personalizadas ok")

    # categoria usada não pode ser removida
    page.goto(BASE + "/movimentacoes")
    page.get_by_role("button", name="Nova movimentação").click()
    dlg = page.get_by_role("dialog", name="Nova movimentação")
    dlg.get_by_label("Valor (R$)").fill("10,00")
    dlg.get_by_label("Descrição").fill("Lembrança")
    dlg.get_by_label("Categoria").select_option(label="Presentes e festas")
    dlg.get_by_role("button", name="Salvar").click()
    page.goto(BASE + "/configuracoes")
    page.get_by_role("button", name="Remover Presentes e festas").click()
    page.get_by_role("button", name="Confirmar remoção").click()
    expect(page.get_by_text("Esta categoria já tem lançamentos")).to_be_visible()
    log("9 categoria em uso não é removida")

    # notificações -> avisos no dashboard
    page.goto(BASE + "/dashboard")
    expect(page.get_by_role("region", name="Avisos")).to_be_visible()
    n_alerts = page.get_by_role("region", name="Avisos").locator("li").count()
    page.goto(BASE + "/configuracoes")
    page.get_by_label("Orçamento perto do limite ou ultrapassado").uncheck()
    page.get_by_label("Metas atrasadas").uncheck()
    page.get_by_label("Faturas vencendo ou vencidas").uncheck()
    page.goto(BASE + "/dashboard")
    expect(page.get_by_role("region", name="Avisos")).to_have_count(0)
    page.goto(BASE + "/configuracoes")
    page.get_by_label("Metas atrasadas").check()
    page.goto(BASE + "/dashboard")
    expect(page.get_by_role("region", name="Avisos")).to_be_visible()
    log("10 avisos seguem preferências (antes:", n_alerts, ")")

    # widgets via configurações
    page.goto(BASE + "/configuracoes")
    page.get_by_label("Parcelas", exact=True).uncheck()
    page.goto(BASE + "/dashboard")
    expect(page.get_by_role("heading", name="Parcelas", level=2)).to_have_count(0)
    log("11 widget removido pelas configurações")

    # ---- backup: exporta, altera, importa de volta
    page.goto(BASE + "/configuracoes")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Baixar backup (JSON)").click()
    backup_path = dl.value.path()
    parsed = json.load(open(backup_path, encoding="utf-8"))
    assert parsed["app"] == "appfinances" and parsed["version"] == 2 and len(parsed["data"]["transactions"]) > 50
    log("12 backup baixado:", dl.value.suggested_filename, "transações:", len(parsed["data"]["transactions"]))

    page.get_by_role("button", name="Restaurar dados de demonstração").click()
    page.get_by_role("button", name="Sim, apagar").click()
    expect(page.get_by_text("Dados de demonstração restaurados.")).to_be_visible()
    page.goto(BASE + "/patrimonio")
    expect(page.locator("li", has_text="Ativo E2E")).to_have_count(0)

    page.goto(BASE + "/configuracoes")
    page.set_input_files("#backup-file", backup_path)
    expect(page.get_by_role("alertdialog")).to_contain_text("Substituir todos os dados atuais")
    page.get_by_role("button", name="Sim, substituir").click()
    expect(page.get_by_text("Backup restaurado.")).to_be_visible()
    page.goto(BASE + "/patrimonio")
    expect(page.locator("li", has_text="Ativo E2E").first).to_be_visible()
    log("13 importação restaurou o ativo criado antes")

    # backup inválido
    bad = "/tmp/bad.json"; open(bad, "w").write('{"app":"outro"}')
    page.goto(BASE + "/configuracoes")
    page.set_input_files("#backup-file", bad)
    expect(page.get_by_text("Este arquivo não é um backup válido do Appfinances.")).to_be_visible()
    log("14 backup inválido recusado")

    # persistência
    page.reload()
    page.goto(BASE + "/patrimonio")
    expect(page.locator("li", has_text="Ativo E2E").first).to_be_visible()

    for name, url in [("dash", "/dashboard"), ("patr", "/patrimonio"), ("rel", "/relatorios"), ("conf", "/configuracoes")]:
        page.goto(BASE + url); page.wait_for_timeout(900)
        page.screenshot(path=f"/tmp/e4_{name}.png", full_page=True)
    m = b.new_context(viewport={"width": 390, "height": 800}, locale="pt-BR").new_page()
    m.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
    for name, url in [("patr", "/patrimonio"), ("rel", "/relatorios"), ("conf", "/configuracoes")]:
        m.goto(BASE + url); m.wait_for_timeout(700); m.screenshot(path=f"/tmp/e4_m_{name}.png")
    b.close()

log("ERROS DE CONSOLE:", errors if errors else "nenhum")
