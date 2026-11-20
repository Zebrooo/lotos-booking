import json
import re
import sys
from zipfile import ZipFile
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": DOC_REL, "p": PKG_REL}


def text_of(node):
    return "".join(item.text or "" for item in node.findall(".//m:t", NS))


def read_rows(path):
    with ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [text_of(item) for item in root.findall("m:si", NS)]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        sheets = workbook.findall(".//m:sheet", NS)
        sheet = next((item for item in sheets if item.attrib.get("name") == "price"), sheets[0])
        target = targets[sheet.attrib[f"{{{DOC_REL}}}id"]]
        sheet_path = target.lstrip("/") if target.startswith("/xl/") else "xl/" + target.lstrip("/")
        root = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                column = re.match(r"[A-Z]+", cell.attrib.get("r", ""))
                if not column:
                    continue
                kind = cell.attrib.get("t")
                value_node = cell.find("m:v", NS)
                if kind == "inlineStr":
                    value = text_of(cell)
                elif value_node is None:
                    value = ""
                elif kind == "s":
                    value = shared[int(value_node.text)]
                else:
                    value = value_node.text or ""
                values[column.group()] = value.strip()
            if values.get("A") and values.get("C"):
                rows.append({"code": values["A"], "price": values.get("B", "0"), "title": values["C"]})
        return rows


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Использование: xlsx-to-json.py <файл.xlsx>")
    json.dump(read_rows(sys.argv[1]), sys.stdout, ensure_ascii=False)
