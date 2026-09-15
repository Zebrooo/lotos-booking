# -*- coding: utf-8 -*-
"""Лист решения для директора: одна страница A4.

Сборка:    python3 docs/pdf/build-decision-sheet.py
Результат: docs/pdf/decision-sheet.pdf
Текст:     docs/11-decision-sheet.md (источник правды, править там и здесь синхронно)
Шрифт:     первый найденный из FONTS — DejaVu Sans на Linux, Arial на macOS и Windows.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

FONTS = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf",
     "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]
for regular, bold in FONTS:
    if Path(regular).exists() and Path(bold).exists():
        pdfmetrics.registerFont(TTFont("F", regular))
        pdfmetrics.registerFont(TTFont("F-B", bold))
        pdfmetrics.registerFontFamily("F", normal="F", bold="F-B", italic="F", boldItalic="F-B")
        break
else:
    raise SystemExit("Не найден шрифт с кириллицей, дополните список FONTS")

OUT = Path(__file__).with_name("decision-sheet.pdf")

NAVY = colors.HexColor("#1f3a5f")
GREY = colors.HexColor("#555555")

title = ParagraphStyle("title", fontName="F-B", fontSize=16, leading=20, textColor=NAVY, spaceAfter=2)
sub = ParagraphStyle("sub", fontName="F", fontSize=9, leading=12, textColor=GREY, spaceAfter=6)
h = ParagraphStyle("h", fontName="F-B", fontSize=11, leading=14, textColor=NAVY, spaceBefore=7, spaceAfter=3)
body = ParagraphStyle("body", fontName="F", fontSize=10, leading=13.2, spaceAfter=4)
item = ParagraphStyle("item", parent=body, leftIndent=6 * mm, firstLineIndent=-6 * mm, spaceAfter=3.5)
boxb = ParagraphStyle("boxb", parent=body, spaceAfter=3)
small = ParagraphStyle("small", fontName="F", fontSize=8, leading=10.5, textColor=GREY, spaceBefore=6)

MARGIN = 16 * mm
W = A4[0] - 2 * MARGIN


def box(flows):
    t = Table([[flows]], colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f4f7fb")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#b8c6d8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def choice(text):
    square = Table([[""]], colWidths=[4.2 * mm], rowHeights=[4.2 * mm])
    square.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.9, NAVY)]))
    t = Table([[square, Paragraph(text, boxb)]], colWidths=[7 * mm, W - 16 - 7 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return t


S = []
A = S.append

A(Paragraph("Онлайн-запись: одно решение и три факта", title))
A(Paragraph("Медицинский центр «Лотос». Для разговора с директором, сентябрь 2026 года.", sub))

A(Paragraph("Коротко", h))
A(Paragraph(
    "Обследование сделано. Расписание ведётся в 1С, касса есть, деньги по ссылке приходят "
    "на счёт клиники, к 1С есть доступ. Чтобы назвать срок и цену, нужно одно ваше решение "
    "и три изменения в замысле, которых требует закон.", body))

A(Paragraph("Решение: на сайте только оплата сразу", h))
A(box([
    Paragraph("<b>Что предлагаем.</b> Пациент выбирает врача и время, платит 400 рублей по СБП "
              "и сразу получает подтверждение. Запись без оплаты «до 17:00» и наличные остаются "
              "как сейчас: по телефону и в регистратуре.", boxb),
    Paragraph("<b>Почему.</b> Сегодня клиника узнаёт об оплате из СМС банка, и ни человек, ни "
              "программа не может понять, чей это платёж: сумма у всех одна. Чтобы система сама "
              "снимала неоплаченные записи, она должна сама видеть оплату. Это возможно, но делает "
              "проект примерно втрое дороже и дольше.", boxb),
    choice("Согласна: на сайте только оплата сразу."),
    choice("Нужна запись без оплаты и на сайте. Обсуждаем отдельно: это другой проект, срок и смета."),
]))

A(Paragraph("Три вещи, которые придётся изменить", h))
A(Paragraph("Это не наши пожелания и не осторожность. Каждый пункт проверен по тексту закона; "
            "юристу клиники стоит сверить перед договором.", body))
A(Paragraph("<b>1. На предоплату нужен чек.</b> Закон о кассах относит аванс к расчётам, чек "
            "обязателен. Касса у вас есть, значит нужна только настройка: чек при получении "
            "400 рублей, чек при приёме, чек при возврате. По предоплатам, уже принятым без чека, "
            "можно подать чеки коррекции самостоятельно до запуска сайта, тогда штрафа нет. "
            "Иначе штраф от 30 000 рублей за каждый случай.", item))
A(Paragraph("<b>2. «Предоплата не возвращается» пишем иначе.</b> Порог по времени задаём вместе: "
            "до него отмена с возвратом, после него предоплата удерживается в счёт фактических "
            "расходов клиники. Пациент видит это до оплаты и подтверждает отдельной галочкой. "
            "Слова «не возвращается» в текстах не используем: такое условие по закону "
            "недействительно, вы это и сами отметили в ответах.", item))
A(Paragraph("<b>3. Саму отмену не блокируем.</b> Порог меняет последствие отмены, а не возможность. "
            "Запрет ничего не даёт: пациент, которому не дали отменить, просто не приходит, и окно "
            "пропадает. Отменённое после порога окно можно продать снова.", item))
A(Paragraph("<b>Отдельно, вне связи с онлайн-записью.</b> С 1 сентября 2026 года действуют новые "
            "Правила платных медицинских услуг (постановление Правительства № 659). Договор, сайт "
            "и стенд надо привести в соответствие в любом случае. Это работа для юриста.", body))

A(Paragraph("Что дальше", h))
A(Paragraph("На этой неделе смотрим 1С и спрашиваем банк, как принимать оплату с сайта. После "
            "этого называем срок и цену. Запускаемся тихо: два-три врача на месяц, потом "
            "остальные.", body))

A(Paragraph("Что нужно от клиники", h))
A(Paragraph("Ваше решение по первому пункту и порог по времени для отмены с возвратом, например "
            "24 часа. Юрист для текстов: договор-оферта, политика обработки данных, два отдельных "
            "согласия. Один ответственный администратор, с которым мы будем работать.", body))

A(Paragraph("Источники: закон 54-ФЗ, ст. 1.1 и 1.2; КоАП, ст. 14.5 ч. 2 и примечание к ней; закон "
            "о защите прав потребителей, ст. 16 и 32; постановление Правительства РФ от 30.05.2026 "
            "№ 659.", small))


def deco(canvas, doc):
    canvas.saveState()
    canvas.setFont("F", 8)
    canvas.setFillColor(colors.HexColor("#8a8a8a"))
    canvas.drawString(MARGIN, 10 * mm, "Онлайн-запись «Лотос»: лист решения")
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                        topMargin=14 * mm, bottomMargin=16 * mm,
                        title="Онлайн-запись «Лотос»: одно решение и три факта")
doc.build(S, onFirstPage=deco, onLaterPages=deco)
print(OUT)
