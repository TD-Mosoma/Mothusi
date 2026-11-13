"""Reads the text out of a teacher's uploaded material so the agents can use it when planning."""

import io
import re
import zipfile
from xml.etree import ElementTree

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_CHARS = 40_000
MAX_PDF_PAGES = 40
MAX_DOCX_XML_BYTES = 20_000_000
SUPPORTED = (".pdf", ".docx", ".txt", ".md")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class UnreadableDocument(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace")
    elif name.endswith(".pdf"):
        text = _pdf(data)
    elif name.endswith(".docx"):
        text = _docx(data)
    else:
        raise UnreadableDocument("Mothusi can read PDF, Word (.docx) and plain text files.")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:MAX_CHARS]


def _pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise UnreadableDocument("This PDF is password-protected.")
        return "\n\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PDF_PAGES])
    except (PdfReadError, ValueError, KeyError) as exc:
        if isinstance(exc, UnreadableDocument):
            raise
        raise UnreadableDocument("This PDF could not be read.") from exc


def _docx(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            info = z.getinfo("word/document.xml")
            if info.file_size > MAX_DOCX_XML_BYTES:
                raise UnreadableDocument("This Word document is too large to read.")
            root = ElementTree.fromstring(z.read(info))
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as exc:
        raise UnreadableDocument("This Word document could not be read.") from exc
    paragraphs = []
    for p in root.iter(f"{W}p"):
        paragraphs.append("".join(t.text or "" for t in p.iter(f"{W}t")))
    return "\n".join(paragraphs)
