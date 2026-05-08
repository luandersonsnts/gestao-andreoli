import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


def _normalize_text(value: str) -> str:
  v = unicodedata.normalize("NFKD", value or "")
  v = "".join([c for c in v if not unicodedata.combining(c)])
  v = re.sub(r"[^A-Za-z0-9\s]", " ", v)
  v = re.sub(r"\s+", " ", v).strip().lower()
  return v


def similarity(a: str, b: str) -> float:
  na = _normalize_text(a)
  nb = _normalize_text(b)
  if not na or not nb:
    return 0.0
  return SequenceMatcher(None, na, nb).ratio()


@dataclass(frozen=True)
class PdfExtract:
  raw_text: str
  nome: str | None
  grupo: str | None
  cota: str | None
  vencimento: str | None


_RE_GRUPO = re.compile(r"\bgrupo\b\D{0,10}(?P<v>\d{1,6})", re.IGNORECASE)
_RE_COTA = re.compile(r"\bcota\b\D{0,10}(?P<v>\d{1,6})", re.IGNORECASE)
_RE_VENC = re.compile(r"\b(vencimento|vencto|vcto)\b\D{0,10}(?P<v>\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})", re.IGNORECASE)
_RE_NOME = re.compile(r"\b(nome|sacado|cliente|pagador)\b\D{0,40}(?P<v>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,80})", re.IGNORECASE)


def _first_int(value: str | None) -> int | None:
  if value is None:
    return None
  m = re.search(r"(\d+)", str(value))
  if not m:
    return None
  try:
    return int(m.group(1))
  except Exception:
    return None


def _first_name(value: str | None) -> str | None:
  n = _normalize_text(value or "")
  if not n:
    return None
  parts = n.split()
  if not parts:
    return None
  return parts[0]


def extract_pdf_text(pdf_path: Path) -> str:
  text_parts: list[str] = []
  try:
    import pdfplumber  # type: ignore

    with pdfplumber.open(str(pdf_path)) as pdf:
      for page in pdf.pages[:2]:
        t = page.extract_text() or ""
        if t:
          text_parts.append(t)
  except Exception:
    try:
      from PyPDF2 import PdfReader  # type: ignore

      reader = PdfReader(str(pdf_path))
      for page in reader.pages[:2]:
        t = page.extract_text() or ""
        if t:
          text_parts.append(t)
    except Exception:
      return ""

  return "\n".join(text_parts)


def extract_fields(pdf_path: Path) -> PdfExtract:
  raw = extract_pdf_text(pdf_path)
  if not raw:
    return PdfExtract(raw_text="", nome=None, grupo=None, cota=None, vencimento=None)

  grupo = None
  cota = None
  venc = None
  nome = None

  mg = _RE_GRUPO.search(raw)
  if mg:
    grupo = mg.group("v")

  mc = _RE_COTA.search(raw)
  if mc:
    cota = mc.group("v")

  mv = _RE_VENC.search(raw)
  if mv:
    venc = mv.group("v")

  mn = _RE_NOME.search(raw)
  if mn:
    nome = re.sub(r"\s+", " ", mn.group("v")).strip()

  return PdfExtract(raw_text=raw, nome=nome, grupo=grupo, cota=cota, vencimento=venc)


def validate_match(
  *,
  filename_grupo: str,
  filename_cota: str,
  db_grupo: str,
  db_cota: str,
  db_nome: str,
  pdf: PdfExtract,
  min_similarity: float,
  allow_pdf_missing: bool = True
) -> tuple[bool, str | None, dict[str, Any]]:
  f_grupo_n = _first_int(filename_grupo)
  f_cota_n = _first_int(filename_cota)
  db_grupo_n = _first_int(db_grupo)
  db_cota_n = _first_int(db_cota)
  pdf_grupo_n = _first_int(pdf.grupo)
  pdf_cota_n = _first_int(pdf.cota)

  details: dict[str, Any] = {
    "filename": {"grupo": filename_grupo, "cota": filename_cota},
    "db": {"grupo": db_grupo, "cota": db_cota, "nome": db_nome},
    "pdf": {"grupo": pdf.grupo, "cota": pdf.cota, "nome": pdf.nome, "vencimento": pdf.vencimento},
    "normalized": {
      "filename": {"grupo": f_grupo_n, "cota": f_cota_n},
      "db": {"grupo": db_grupo_n, "cota": db_cota_n},
      "pdf": {"grupo": pdf_grupo_n, "cota": pdf_cota_n}
    }
  }

  if f_grupo_n is None or f_cota_n is None:
    return (False, "Formato inválido no nome do arquivo. Use G123_C456.pdf", details)

  if db_grupo_n is None or db_cota_n is None:
    return (False, "Grupo/Cota inválidos no banco (cadastro da cota)", details)

  if f_grupo_n != db_grupo_n or f_cota_n != db_cota_n:
    return (False, "Grupo/Cota do arquivo não batem com o banco (segurança)", details)

  if pdf_grupo_n is None or pdf_cota_n is None:
    if allow_pdf_missing:
      details["pdf_validation"] = "skipped_missing_numbers"
    else:
      return (False, "Não foi possível extrair Grupo/Cota do PDF (segurança)", details)

  if (pdf_grupo_n is not None and pdf_cota_n is not None) and (pdf_grupo_n != db_grupo_n or pdf_cota_n != db_cota_n):
    return (False, "Grupo/Cota do PDF não batem com o banco (segurança)", details)

  details["pdf_validation"] = details.get("pdf_validation") or "skipped_name_check"
  return (True, None, details)
