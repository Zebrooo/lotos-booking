from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold")

OUT = "/tmp/claude-0/-home-user-abkhaz-auto/4a5a4a4d-740e-5c80-9baf-a0488d76858b/scratchpad/lotos-voprosy-online-zapis.pdf"

title = ParagraphStyle("title", fontName="DejaVu-Bold", fontSize=18, leading=23, spaceAfter=4)
sub = ParagraphStyle("sub", fontName="DejaVu", fontSize=10.5, leading=15, textColor=colors.HexColor("#555555"), spaceAfter=14)
h = ParagraphStyle("h", fontName="DejaVu-Bold", fontSize=13, leading=17, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#1f3a5f"))
q = ParagraphStyle("q", fontName="DejaVu", fontSize=10.5, leading=15, leftIndent=9*mm, firstLineIndent=-9*mm, spaceAfter=5)
note = ParagraphStyle("note", fontName="DejaVu", fontSize=9.5, leading=13.5, leftIndent=9*mm, textColor=colors.HexColor("#555555"), spaceAfter=7)
body = ParagraphStyle("body", fontName="DejaVu", fontSize=10.5, leading=15, spaceAfter=6)

sections = [
    ("Расписание и врачи", [
        ("Как сейчас ведётся расписание врачей: в программе, в тетради, в Excel? Если в программе — какой именно?", None),
        ("Кто и как часто меняет расписание: отпуска, больничные, замена врача? Кто будет вносить эти изменения на сайт?", None),
        ("Сколько врачей и специальностей? Бывает ли, что один врач ведёт приёмы разной длительности, например консультация и УЗИ?", None),
    ]),
    ("Оплата", [
        ("«Ссылка на предоплату в Челиндбанке» — это что именно: у вас подключён приём платежей на сайте, есть QR-код для перевода, или что-то другое? Можете показать, как это выглядит сейчас?", None),
        ("Как вы узнаёте, что пациент оплатил по ссылке: банк сообщает автоматически или бухгалтер смотрит выписку?", None),
        ("Выдаёте ли чек на предоплату? Есть ли онлайн-касса?", None),
        ("Наличные в кассу до 17:00 — кто в этот момент отметит, что запись оплачена?", None),
        ("Что считать «вечером»? После какого часа запись переносит срок оплаты на завтра? Как быть с субботой и воскресеньем?", None),
        ("400 рублей — всегда одинаково для всех врачей и услуг, или могут быть исключения?", None),
    ]),
    ("Отмена и возврат", [
        ("Если пациент отменяет за сутки — ему возвращают 400 рублей или переносят на другую дату? Кто делает возврат и как это происходит сейчас?", None),
        ("Если пациент отменяет позже, чем за сутки, — разрешить ему отмену без возврата, чтобы время освободилось для другого пациента, или запретить отмену совсем?",
         "Мы советуем первое: иначе пациент просто не придёт, а время пропадёт."),
        ("Если пациент не пришёл и не предупредил — что происходит с записью и деньгами?", None),
        ("Может ли пациент перенести запись на другое время, а не отменить?", None),
    ]),
    ("Данные пациента", [
        ("Паспорт, СНИЛС, ИНН, прописка — они нужны именно в момент записи на сайте, или их можно взять при подписании документов за 10 минут до приёма?",
         "Хранение таких данных на сайте — серьёзная обязанность по закону о персональных данных, и часть людей уходит на этом шаге. Мы предлагаем брать на сайте только ФИО, дату рождения и телефон."),
        ("Записывать можно только себя, или также ребёнка и родственника?", None),
        ("Кто у вас отвечает за юридические тексты: согласие на обработку данных, правила предоплаты? Есть ли юрист, который их напишет и утвердит?", None),
    ]),
    ("Сайт и запуск", [
        ("На чём сделан текущий сайт и кто его обслуживает? Есть ли доступ к нему?", None),
        ("Запись должна быть частью текущего сайта или отдельной страницей, на которую ведёт кнопка «Записаться»?", None),
        ("Кто в клинике будет отвечать за запись: смотреть заявки, отмечать оплаты, вести расписание? Один человек или несколько?", None),
        ("Смотрели ли вы готовые сервисы онлайн-записи? Готовы ли платить ежемесячную подписку, или хотите своё решение один раз?", None),
    ]),
]

story = [
    Paragraph("Онлайн-запись к врачам: вопросы для обсуждения", title),
    Paragraph("Медицинский центр «Лотос». Ответы на эти вопросы нужны, чтобы понять объём работы и выбрать способ реализации.", sub),
]

n = 0
for name, items in sections:
    first = True
    for text, hint in items:
        n += 1
        item = [Paragraph(name, h)] if first else []
        first = False
        item.append(Paragraph(f"<b>{n}.</b>&nbsp;&nbsp;{text}", q))
        if hint:
            item.append(Paragraph(hint, note))
        story.append(KeepTogether(item))

story.append(Spacer(1, 10))
key = [
    Paragraph("Что важнее всего", h),
    Paragraph("Ответы на вопросы <b>1, 4, 5 и 14</b> определяют объём работы сильнее остальных. Если расписание ведётся в программе, оплату банк подтверждает сам, а паспортные данные согласны брать на месте — задача становится в разы проще и дешевле.", body),
    Paragraph("Мы берём на себя: единое расписание для записей с сайта, по телефону и в регистратуре, чтобы одно время нельзя было продать дважды; автоматическое снятие неоплаченных записей; напоминания пациентам.", body),
]
story.append(KeepTogether(key))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("DejaVu", 8.5)
    canvas.setFillColor(colors.HexColor("#888888"))
    canvas.drawString(20*mm, 12*mm, "Онлайн-запись «Лотос» — вопросы для обсуждения")
    canvas.drawRightString(A4[0]-20*mm, 12*mm, f"стр. {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm,
                        title="Онлайн-запись «Лотос»: вопросы", author="abkhaz-auto team")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
