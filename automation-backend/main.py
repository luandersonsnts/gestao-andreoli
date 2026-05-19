import os
import random
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, unquote

import pg8000
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from pdf_validate import extract_fields, validate_match
from whatsapp import WhatsAppWeb

FILENAME_RE = re.compile(r"^G(?P<grupo>\d+)_C(?P<cota>\d+)(?:[ _-].*)?\.pdf$", re.IGNORECASE)

def log_debug(msg: str):
  ts = time.strftime("%H:%M:%S")
  print(f"[DEBUG {ts}] {msg}", flush=True)


def now_utc() -> datetime:
  return datetime.now(timezone.utc)


def greeting_at(dt: datetime) -> str:
  h = dt.astimezone().hour
  if 5 <= h <= 11:
    return "Bom dia"
  if 12 <= h <= 17:
    return "Boa tarde"
  return "Boa noite"


def normalize_phone(value: str) -> str | None:
  digits = re.sub(r"\D+", "", value or "")
  if not digits:
    return None
  if digits.startswith("00"):
    digits = digits[2:]
  if digits.startswith("55"):
    return digits
  if len(digits) in (10, 11):
    return "55" + digits
  return None


class Settings(BaseModel):
  database_url: str
  boletos_dir: Path
  enviados_dir: Path
  erro_dir: Path
  min_delay_sec: float
  max_delay_sec: float
  max_per_minute: int
  wa_send_timeout_sec: int
  min_similarity: float
  pdf_strict: bool
  whatsapp_profile_dir: Path
  whatsapp_headless: bool
  wa_test_fallback: bool


def load_settings() -> Settings:
  root = Path(__file__).resolve().parent
  boletos_dir = Path(os.environ.get("BOLETOS_DIR", str(root / "boletos"))).resolve()
  enviados_dir = Path(os.environ.get("ENVIADOS_DIR", str(root / "enviados"))).resolve()
  erro_dir = Path(os.environ.get("ERRO_DIR", str(root / "erro"))).resolve()
  return Settings(
    database_url=os.environ.get("DATABASE_URL", "").strip(),
    boletos_dir=boletos_dir,
    enviados_dir=enviados_dir,
    erro_dir=erro_dir,
    min_delay_sec=float(os.environ.get("WA_MIN_DELAY_SEC", "5")),
    max_delay_sec=float(os.environ.get("WA_MAX_DELAY_SEC", "10")),
    max_per_minute=int(os.environ.get("WA_MAX_PER_MINUTE", "10")),
    wa_send_timeout_sec=int(os.environ.get("WA_SEND_TIMEOUT_SEC", "300")),
    min_similarity=float(os.environ.get("PDF_NAME_MIN_SIMILARITY", "0.8")),
    pdf_strict=os.environ.get("PDF_STRICT", "0") in ("1", "true", "sim", "yes"),
    whatsapp_profile_dir=Path(os.environ.get("WA_PROFILE_DIR", str(root / "wa-profile"))).resolve(),
    whatsapp_headless=os.environ.get("WA_HEADLESS", "0") in ("1", "true", "sim", "yes"),
    wa_test_fallback=os.environ.get("WA_TEST_FALLBACK", "0") in ("1", "true", "sim", "yes")
  )


settings = load_settings()
if not settings.database_url:
  raise RuntimeError("DATABASE_URL não configurado")

settings.boletos_dir.mkdir(parents=True, exist_ok=True)
settings.enviados_dir.mkdir(parents=True, exist_ok=True)
settings.erro_dir.mkdir(parents=True, exist_ok=True)
settings.whatsapp_profile_dir.mkdir(parents=True, exist_ok=True)

log_debug(f"BOLETOS_DIR={settings.boletos_dir}")
log_debug(f"ENVIADOS_DIR={settings.enviados_dir}")
log_debug(f"ERRO_DIR={settings.erro_dir}")
log_debug(f"WA_PROFILE_DIR={settings.whatsapp_profile_dir}")
log_debug(f"WA_HEADLESS={settings.whatsapp_headless}")
log_debug(f"WA_SEND_TIMEOUT_SEC={settings.wa_send_timeout_sec}")
log_debug(f"WA_TEST_FALLBACK={settings.wa_test_fallback}")

app = FastAPI(title="Andreoli Automação - WhatsApp Boletos")

_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()
_worker_lock = threading.Lock()
_observer: Observer | None = None
_wa_lock = threading.Lock()
_wa_instance: WhatsAppWeb | None = None
_worker_last_error: str | None = None
_wa_closing = False


def wait_file_stable(path: Path, timeout_sec: float = 10.0) -> bool:
  start = time.time()
  last_size = -1
  stable_count = 0
  while time.time() - start < timeout_sec:
    try:
      size = path.stat().st_size
    except FileNotFoundError:
      time.sleep(0.2)
      continue
    if size == last_size and size > 0:
      stable_count += 1
      if stable_count >= 3:
        return True
    else:
      stable_count = 0
      last_size = size
    time.sleep(0.3)
  return False


class BoletosHandler(FileSystemEventHandler):
  def on_created(self, event):
    if getattr(event, "is_directory", False):
      return
    p = Path(getattr(event, "src_path", ""))
    if p.suffix.lower() != ".pdf":
      return
    if not wait_file_stable(p):
      return
    try:
      process_incoming_pdf(p)
    except Exception:
      pass


def get_conn():
  u = urlparse(settings.database_url)
  if u.scheme not in ("postgres", "postgresql"):
    raise RuntimeError("DATABASE_URL inválido (esperado postgres/postgresql)")
  user = unquote(u.username or "")
  password = unquote(u.password or "")
  host = u.hostname or "localhost"
  port = int(u.port or 5432)
  database = (u.path or "").lstrip("/")
  if not database:
    raise RuntimeError("DATABASE_URL inválido (database ausente)")
  return pg8000.connect(user=user, password=password, host=host, port=port, database=database)


def ensure_envios_table_exists():
  ddl = """
  CREATE TABLE IF NOT EXISTS "BoletoEnvio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "cotaId" TEXT,
    "arquivo" TEXT NOT NULL,
    "grupo" TEXT,
    "cota" TEXT,
    "telefone" TEXT,
    "status" TEXT NOT NULL,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "BoletoEnvio_pkey" PRIMARY KEY ("id")
  );
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(ddl)
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


def ensure_cliente_columns_exist():
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute('ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS telefone TEXT')
    cur.execute('ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE')
    cur.execute('ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "pontuacaoRanking" INTEGER NOT NULL DEFAULT 0')
    cur.execute('ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT \'NORMAL\'')
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


ensure_envios_table_exists()
ensure_cliente_columns_exist()


@app.on_event("startup")
def _startup():
  global _observer
  if _observer is not None:
    return
  ob = Observer()
  ob.schedule(BoletosHandler(), str(settings.boletos_dir), recursive=False)
  ob.daemon = True
  ob.start()
  _observer = ob


@app.on_event("shutdown")
def _shutdown():
  global _observer
  _stop_event.set()
  if _observer is not None:
    try:
      _observer.stop()
      _observer.join(timeout=2)
    finally:
      _observer = None


class DashboardOut(BaseModel):
  enviadosHoje: int
  pendentes: int
  erros: int
  clientesComAtraso: int
  taxaSucessoHoje: float
  workerAtivo: bool
  workerErro: str | None = None


class JobItem(BaseModel):
  id: str
  arquivo: str
  status: str
  erro: str | None
  tentativas: int
  clienteId: str | None
  clienteNome: str | None
  telefone: str | None
  createdAt: str
  sentAt: str | None


class JobsOut(BaseModel):
  items: list[JobItem]


class ScanOut(BaseModel):
  encontrados: int
  enfileirados: int
  erros: int


def find_cota_and_cliente(grupo: str, cota: str):
  log_debug(f"Buscando no banco: grupo={grupo!r} cota={cota!r}")
  sql = """
  SELECT co.id as cota_id, cl.id as cliente_id, cl.nome as cliente_nome, cl.telefone as telefone, cl.active as active, co.grupo as db_grupo, co.cota as db_cota
  FROM "Cota" co
  JOIN "Cliente" cl ON cl.id = co."clienteId"
  WHERE NULLIF(substring(co.grupo from '(\\d+)'), '')::int = %s::int
    AND NULLIF(substring(co.cota from '(\\d+)'), '')::int = %s::int
  ORDER BY co."updatedAt" DESC
  LIMIT 1
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, (grupo, cota))
    row = cur.fetchone()
    if not row:
      log_debug("Banco: nenhum registro encontrado para grupo/cota.")
      return None
    log_debug(f"Banco: encontrado cliente={row[2]!r} telefone={row[3]!r} active={bool(row[4])}")
    return {
      "cotaId": row[0],
      "clienteId": row[1],
      "clienteNome": row[2],
      "telefone": row[3],
      "active": bool(row[4]),
      "dbGrupo": row[5],
      "dbCota": row[6]
    }
  finally:
    try:
      conn.close()
    except Exception:
      pass


def create_error_job(file_path: Path, err: str, grupo: str | None = None, cota: str | None = None, telefone: str | None = None, cliente_id: str | None = None, cota_id: str | None = None):
  job_id = str(uuid.uuid4())
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(
      """
      INSERT INTO "BoletoEnvio" ("id","clienteId","cotaId","arquivo","grupo","cota","telefone","status","erro","tentativas","createdAt","updatedAt","sentAt")
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,%s)
      """,
      (job_id, cliente_id, cota_id, file_path.name, grupo, cota, telefone, "ERRO", err, 0, None)
    )
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


def get_latest_job_for_file(file_name: str) -> dict[str, Any] | None:
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(
      'SELECT id, status FROM "BoletoEnvio" WHERE arquivo = %s ORDER BY "createdAt" DESC LIMIT 1',
      (file_name,)
    )
    row = cur.fetchone()
    if not row:
      return None
    return {"id": row[0], "status": row[1]}
  finally:
    try:
      conn.close()
    except Exception:
      pass


def update_job_record(job_id: str, status: str, erro: str | None, *, cliente_id: str | None = None, cota_id: str | None = None, telefone: str | None = None, grupo: str | None = None, cota: str | None = None, reset_tentativas: bool = False):
  sql = """
  UPDATE "BoletoEnvio"
  SET status = %s,
      erro = %s,
      "clienteId" = COALESCE(%s, "clienteId"),
      "cotaId" = COALESCE(%s, "cotaId"),
      telefone = COALESCE(%s, telefone),
      grupo = COALESCE(%s, grupo),
      cota = COALESCE(%s, cota),
      tentativas = CASE WHEN %s THEN 0 ELSE tentativas END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = %s
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, (status, erro, cliente_id, cota_id, telefone, grupo, cota, reset_tentativas, job_id))
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


def upsert_job_for_file(file_path: Path) -> tuple[bool, str | None]:
  m = FILENAME_RE.match(file_path.name)
  if not m:
    return (False, "Formato inválido. Use G123_C456.pdf")

  grupo = m.group("grupo")
  cota = m.group("cota")
  existing = get_latest_job_for_file(file_path.name)
  if existing and existing["status"] in ("PENDENTE", "ENVIANDO", "ENVIADO"):
    return (False, None)

  found = find_cota_and_cliente(grupo, cota)
  if not found:
    msg = "Cota/cliente não encontrado no banco"
    if existing:
      try:
        update_job_record(existing["id"], "ERRO", msg, grupo=grupo, cota=cota)
      except Exception:
        pass
      return (False, msg)
    return (False, msg)

  if not found["active"]:
    msg = "Cliente está inativo"
    if existing:
      try:
        update_job_record(existing["id"], "ERRO", msg, cliente_id=found["clienteId"], cota_id=found["cotaId"], grupo=grupo, cota=cota)
      except Exception:
        pass
      return (False, msg)
    return (False, msg)

  telefone = normalize_phone(found["telefone"] or "")
  if not telefone:
    msg = "Telefone inválido/ausente no cliente"
    if existing:
      try:
        update_job_record(existing["id"], "ERRO", msg, cliente_id=found["clienteId"], cota_id=found["cotaId"], grupo=grupo, cota=cota)
      except Exception:
        pass
      return (False, msg)
    return (False, msg)

  pdf = extract_fields(file_path)
  ok, err, details = validate_match(
    filename_grupo=grupo,
    filename_cota=cota,
    db_grupo=str(found["dbGrupo"]),
    db_cota=str(found["dbCota"]),
    db_nome=str(found["clienteNome"]),
    pdf=pdf,
    min_similarity=settings.min_similarity,
    allow_pdf_missing=not settings.pdf_strict
  )
  warn = "PDF sem texto (validação parcial)" if details.get("pdf_validation") else None
  if not ok:
    msg = err or "Falha de validação"
    if existing:
      try:
        update_job_record(existing["id"], "ERRO", msg, cliente_id=found["clienteId"], cota_id=found["cotaId"], telefone=telefone, grupo=grupo, cota=cota)
      except Exception:
        pass
      return (False, msg)
    return (False, msg)

  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(
      'SELECT id, status FROM "BoletoEnvio" WHERE arquivo = %s ORDER BY "createdAt" DESC LIMIT 1',
      (file_path.name,)
    )
    exists = cur.fetchone()
    if exists:
      existing_id = exists[0]
      existing_status = exists[1]
      if existing_status in ("PENDENTE", "ENVIANDO", "ENVIADO"):
        return (False, None)
      try:
        update_job_record(
          existing_id,
          "PENDENTE",
          warn,
          cliente_id=found["clienteId"],
          cota_id=found["cotaId"],
          telefone=telefone,
          grupo=grupo,
          cota=cota,
          reset_tentativas=True
        )
        return (True, None)
      except Exception:
        pass

    job_id = str(uuid.uuid4())
    cur.execute(
      """
      INSERT INTO "BoletoEnvio" ("id","clienteId","cotaId","arquivo","grupo","cota","telefone","status","erro","tentativas","createdAt","updatedAt","sentAt")
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,%s)
      """,
      (job_id, found["clienteId"], found["cotaId"], file_path.name, grupo, cota, telefone, "PENDENTE", warn, 0, None)
    )
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass
  return (True, None)


def process_incoming_pdf(file_path: Path) -> tuple[bool, str | None]:
  ok, err = upsert_job_for_file(file_path)
  if ok:
    return (True, None)
  if not err:
    return (False, None)

  m = FILENAME_RE.match(file_path.name)
  grupo = m.group("grupo") if m else None
  cota = m.group("cota") if m else None
  existing = get_latest_job_for_file(file_path.name)
  if not existing:
    try:
      create_error_job(file_path, err, grupo=grupo, cota=cota)
    except Exception:
      pass
  return (False, err)


def move_file(src: Path, dst_dir: Path):
  dst_dir.mkdir(parents=True, exist_ok=True)
  dst = dst_dir / src.name
  if dst.exists():
    dst = dst_dir / f"{src.stem}_{int(time.time())}{src.suffix}"
  shutil.move(str(src), str(dst))

  return dst


def list_pending_jobs(limit: int = 50) -> list[dict[str, Any]]:
  sql = """
  SELECT b.id, b.arquivo, b.status, b.erro, b.tentativas, b."clienteId", c.nome as cliente_nome, b.telefone, b."createdAt", b."sentAt"
  FROM "BoletoEnvio" b
  LEFT JOIN "Cliente" c ON c.id = b."clienteId"
  WHERE b.status IN ('PENDENTE','RETRY')
  ORDER BY b."createdAt" ASC
  LIMIT %s
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, (limit,))
    rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
      out.append(
        {
          "id": r[0],
          "arquivo": r[1],
          "status": r[2],
          "erro": r[3],
          "tentativas": int(r[4] or 0),
          "clienteId": r[5],
          "clienteNome": r[6],
          "telefone": r[7],
          "createdAt": r[8].isoformat() if r[8] else None,
          "sentAt": r[9].isoformat() if r[9] else None
        }
      )
    return out
  finally:
    try:
      conn.close()
    except Exception:
      pass


def update_job(job_id: str, status: str, erro: str | None = None, sent: bool = False):
  sql = """
  UPDATE "BoletoEnvio"
  SET status = %s,
      erro = %s,
      tentativas = tentativas + 1,
      "updatedAt" = CURRENT_TIMESTAMP,
      "sentAt" = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE "sentAt" END
  WHERE id = %s
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, (status, erro, sent, job_id))
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


def set_job_status(job_id: str, status: str, erro: str | None = None):
  sql = """
  UPDATE "BoletoEnvio"
  SET status = %s,
      erro = %s,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = %s
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, (status, erro, job_id))
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass


def count_enviando() -> int:
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM "BoletoEnvio" WHERE status = %s', ("ENVIANDO",))
    return int(cur.fetchone()[0])
  finally:
    try:
      conn.close()
    except Exception:
      pass


def reset_enviando(reason: str, only_stale_minutes: int | None = None) -> int:
  if only_stale_minutes is None:
    sql = """
    UPDATE "BoletoEnvio"
    SET status = %s,
        erro = %s,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE status = %s
    """
    args = ("RETRY", reason, "ENVIANDO")
  else:
    sql = f"""
    UPDATE "BoletoEnvio"
    SET status = %s,
        erro = %s,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE status = %s
      AND "updatedAt" < (CURRENT_TIMESTAMP - INTERVAL '{int(only_stale_minutes)} minutes')
    """
    args = ("RETRY", reason, "ENVIANDO")

  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql, args)
    updated = int(getattr(cur, "rowcount", 0) or 0)
    conn.commit()
    return updated
  finally:
    try:
      conn.close()
    except Exception:
      pass


def count_dashboard() -> DashboardOut:
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM "BoletoEnvio" WHERE status = %s AND DATE("sentAt") = CURRENT_DATE', ("ENVIADO",))
    enviados_hoje = int(cur.fetchone()[0])
    cur.execute('SELECT COUNT(*) FROM "BoletoEnvio" WHERE status = %s AND DATE("createdAt") = CURRENT_DATE', ("ERRO",))
    erros_hoje = int(cur.fetchone()[0])
    cur.execute('SELECT COUNT(*) FROM "BoletoEnvio" WHERE status IN (%s,%s)', ("PENDENTE", "RETRY"))
    pendentes = int(cur.fetchone()[0])
    cur.execute('SELECT COUNT(*) FROM "BoletoEnvio" WHERE status = %s', ("ERRO",))
    erros = int(cur.fetchone()[0])
    try:
      cur.execute('SELECT COUNT(DISTINCT "clienteId") FROM "Cota" WHERE "statusPagamento" = %s', ("ATRASADO",))
      clientes_atraso = int(cur.fetchone()[0])
    except Exception:
      clientes_atraso = 0
  finally:
    try:
      conn.close()
    except Exception:
      pass
  denom = max(1, enviados_hoje + erros_hoje)
  taxa = float(enviados_hoje) / float(denom)
  return DashboardOut(
    enviadosHoje=enviados_hoje,
    pendentes=pendentes,
    erros=erros,
    clientesComAtraso=clientes_atraso,
    taxaSucessoHoje=taxa,
    workerAtivo=is_worker_running(),
    workerErro=_worker_last_error
  )


def is_worker_running() -> bool:
  global _worker_thread
  return _worker_thread is not None and _worker_thread.is_alive()


def send_pdf_with_watchdog(wa: WhatsAppWeb, contact_name: str | None, phone: str | None, message: str, pdf_path: str) -> None:
  err_box: dict[str, Any] = {"err": None}

  def _run():
    try:
      log_debug(f"Envio iniciado: contato={contact_name!r} telefone={phone!r} arquivo={Path(pdf_path).name!r}")
      wa.send_boleto(contact_name=contact_name, phone=phone, message=message, pdf_path=pdf_path, timeout_sec=settings.wa_send_timeout_sec)
      log_debug("Envio finalizado (sem exceção).")
    except Exception as e:
      log_debug(f"Erro no envio (thread): {type(e).__name__}: {e}")
      try:
          d = wa._get_driver()
          screenshot_path = settings.erro_dir / f"erro_whatsapp_{int(time.time())}.png"
          d.save_screenshot(str(screenshot_path))
          log_debug(f"Screenshot salva em: {screenshot_path}")
      except Exception as ex:
          log_debug(f"Falha ao salvar screenshot: {ex}")
      err_box["err"] = e

  t = threading.Thread(target=_run, daemon=True)
  t.start()
  start = time.time()
  while t.is_alive():
    if _stop_event.is_set():
      try:
        wa.close()
      except Exception:
        pass
      raise RuntimeError("Operação cancelada")
    if time.time() - start > float(settings.wa_send_timeout_sec):
      try:
        wa.close()
      except Exception:
        pass
      raise RuntimeError("Timeout no envio do boleto (Selenium travou)")
    time.sleep(0.25)

  if err_box["err"] is not None:
    raise err_box["err"]


def worker_loop():
  global _wa_instance, _worker_last_error
  log_debug("Worker iniciado.")
  wa = WhatsAppWeb(profile_dir=settings.whatsapp_profile_dir, headless=settings.whatsapp_headless)
  with _wa_lock:
    _wa_instance = wa
  sent_timestamps: list[float] = []
  try:
    try:
      reset_enviando("Retomado após reinício do worker", only_stale_minutes=20)
    except Exception:
      pass
    _worker_last_error = None
    try:
      log_debug("Abrindo WhatsApp Web…")
      wa.ensure_ready(stop_event=_stop_event)
      log_debug("WhatsApp Web pronto. Entrando no loop principal.")
    except Exception as e:
      msg = str(e) or "Falha ao abrir WhatsApp Web"
      if msg != "Operação cancelada":
        _worker_last_error = msg
      log_debug(f"Falha no WhatsApp Web: {msg}")
      return
    ran_fallback = False
    last_idle_log = 0.0
    while not _stop_event.is_set():
      jobs = list_pending_jobs(limit=1)
      if not jobs:
        if settings.wa_test_fallback and not ran_fallback:
          ran_fallback = True
          test_contact = "TEST G269 C93"
          test_pdf = settings.boletos_dir / "G269_C93.pdf"
          log_debug(f"Nenhum boleto pendente. Rodando teste fallback: contato={test_contact!r} arquivo={str(test_pdf)!r}")
          try:
            send_pdf_with_watchdog(wa=wa, contact_name=test_contact, phone=None, message="Teste automático: boleto em anexo.", pdf_path=str(test_pdf))
            log_debug("Teste fallback concluído (sem exceção).")
          except Exception as e:
            msg = str(e) or repr(e)
            _worker_last_error = msg
            log_debug(f"Teste fallback falhou: {type(e).__name__}: {msg}")
          time.sleep(1.0)
          continue

        if time.time() - last_idle_log > 10.0:
          last_idle_log = time.time()
          log_debug("Sem boletos pendentes (PENDENTE/RETRY). Aguardando…")
        time.sleep(1.0)
        continue

      job = jobs[0]
      job_id = job["id"]
      pdf_path = settings.boletos_dir / job["arquivo"]
      log_debug(f"Processando job: id={job_id} arquivo={pdf_path.name!r} cliente={job.get('clienteNome')!r} telefone={job.get('telefone')!r}")
      if not pdf_path.exists():
        log_debug("Arquivo não encontrado na pasta /boletos.")
        set_job_status(job_id, "ERRO", "Arquivo não encontrado na pasta /boletos")
        continue

      m = FILENAME_RE.match(pdf_path.name)
      if not m:
        log_debug("Formato inválido no nome do arquivo.")
        set_job_status(job_id, "ERRO", "Formato inválido. Use G123_C456.pdf")
        continue
      found = find_cota_and_cliente(m.group("grupo"), m.group("cota"))
      if not found:
        log_debug("Cota/cliente não encontrado no banco.")
        set_job_status(job_id, "ERRO", "Cota/cliente não encontrado no banco")
        continue
      if not found["active"]:
        log_debug("Cliente está inativo.")
        set_job_status(job_id, "ERRO", "Cliente está inativo")
        continue
      pdf = extract_fields(pdf_path)
      ok_val, err_val, _details = validate_match(
        filename_grupo=m.group("grupo"),
        filename_cota=m.group("cota"),
        db_grupo=str(found["dbGrupo"]),
        db_cota=str(found["dbCota"]),
        db_nome=str(found["clienteNome"]),
        pdf=pdf,
        min_similarity=settings.min_similarity,
        allow_pdf_missing=not settings.pdf_strict
      )
      if not ok_val:
        log_debug(f"Falha de validação: {err_val}")
        set_job_status(job_id, "ERRO", err_val or "Falha de validação")
        continue

      sent_timestamps = [t for t in sent_timestamps if (time.time() - t) < 60]
      if len(sent_timestamps) >= settings.max_per_minute:
        log_debug("Limitador de envio por minuto atingido. Aguardando…")
        time.sleep(2.0)
        continue

      set_job_status(job_id, "ENVIANDO", None)

      saud = greeting_at(now_utc())
      msg = f"{saud}, segue em anexo o seu boleto. Confere os dados por gentileza 👍"

      ok = False
      last_err: str | None = None
      for attempt in range(2):
        try:
          phone = normalize_phone(str(found.get("telefone") or "")) or job.get("telefone")
          log_debug(f"Tentativa {attempt + 1}: envio por telefone={phone!r} (sem busca por nome)")
          send_pdf_with_watchdog(wa=wa, contact_name=None, phone=phone, message=msg, pdf_path=str(pdf_path))
          ok = True
          last_err = None
          break
        except Exception as e:
          last_err = str(e)
          log_debug(f"Tentativa {attempt + 1} falhou: {type(e).__name__}: {last_err}")
          time.sleep(2.0)

      if ok:
        log_debug("Envio confirmado. Movendo para /enviados e marcando ENVIADO.")
        update_job(job_id, "ENVIADO", None, sent=True)
        move_file(pdf_path, settings.enviados_dir)
        sent_timestamps.append(time.time())
        time.sleep(random.uniform(settings.min_delay_sec, settings.max_delay_sec))
      else:
        err_msg = last_err or "Falha no envio"
        not_ready = "WhatsApp Web não está pronto" in err_msg or "timeout" in err_msg.lower()
        if not_ready:
          log_debug(f"WhatsApp não pronto/timeout. Marcando RETRY. Erro={err_msg!r}")
          update_job(job_id, "RETRY", err_msg, sent=False)
          try:
            wa.ensure_ready(stop_event=_stop_event)
          except Exception as e:
            msg2 = str(e)
            if msg2 and msg2 != "Operação cancelada":
              _worker_last_error = msg2
            log_debug(f"Falha ao re-abrir WhatsApp Web: {msg2}")
          time.sleep(1.0)
        else:
          attempts_so_far = int(job.get("tentativas") or 0)
          if attempts_so_far < 5:
            log_debug(f"Falha de envio. Marcando RETRY (tentativas={attempts_so_far + 1}). Erro={err_msg!r}")
            update_job(job_id, "RETRY", err_msg, sent=False)
            time.sleep(1.0)
          else:
            log_debug(f"Falha de envio. Marcando ERRO definitivo (tentativas={attempts_so_far + 1}). Erro={err_msg!r}")
            update_job(job_id, "ERRO", err_msg, sent=False)
            time.sleep(1.0)
  except Exception as e:
    msg = str(e) or "Falha inesperada no worker"
    if msg != "Operação cancelada":
      _worker_last_error = msg
    log_debug(f"Worker finalizou por exceção: {type(e).__name__}: {msg}")
  finally:
    try:
      wa.close()
    except Exception:
      pass
    with _wa_lock:
      if _wa_instance is wa:
        _wa_instance = None
    log_debug("Worker finalizado.")


@app.get("/automation-api/dashboard", response_model=DashboardOut)
def dashboard():
  return count_dashboard()


@app.get("/automation-api/jobs", response_model=JobsOut)
def jobs():
  sql = """
  SELECT b.id, b.arquivo, b.status, b.erro, b.tentativas, b."clienteId", c.nome as cliente_nome, b.telefone, b."createdAt", b."sentAt"
  FROM "BoletoEnvio" b
  LEFT JOIN "Cliente" c ON c.id = b."clienteId"
  ORDER BY b."createdAt" DESC
  LIMIT 200
  """
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
  finally:
    try:
      conn.close()
    except Exception:
      pass
  items: list[JobItem] = []
  for r in rows:
    items.append(
      JobItem(
        id=r[0],
        arquivo=r[1],
        status=r[2],
        erro=r[3],
        tentativas=int(r[4] or 0),
        clienteId=r[5],
        clienteNome=r[6],
        telefone=r[7],
        createdAt=r[8].isoformat() if r[8] else "",
        sentAt=r[9].isoformat() if r[9] else None
      )
    )
  return JobsOut(items=items)


@app.post("/automation-api/scan", response_model=ScanOut)
def scan():
  encontrados = 0
  enfileirados = 0
  erros = 0

  log_debug("Scan iniciado.")
  for pdf in sorted(settings.boletos_dir.glob("*.pdf")):
    encontrados += 1
    try:
      ok, err = process_incoming_pdf(pdf)
      if ok:
        enfileirados += 1
      elif err:
        erros += 1
        log_debug(f"Scan erro: arquivo={pdf.name!r} erro={err!r}")
    except Exception as e:
      erros += 1
      m = FILENAME_RE.match(pdf.name)
      grupo = m.group("grupo") if m else None
      cota = m.group("cota") if m else None
      try:
        create_error_job(pdf, str(e), grupo=grupo, cota=cota)
      except Exception:
        pass

  log_debug(f"Scan finalizado. encontrados={encontrados} enfileirados={enfileirados} erros={erros}")
  return ScanOut(encontrados=encontrados, enfileirados=enfileirados, erros=erros)


@app.post("/automation-api/start")
def start():
  global _worker_thread, _worker_last_error
  log_debug("Start solicitado.")
  with _worker_lock:
    if is_worker_running():
      log_debug("Worker já está ativo.")
      return {"ok": True}
    try:
      reset_enviando("Retomado após reinício do serviço", only_stale_minutes=10)
    except Exception:
      pass
    if count_enviando() > 0:
      raise HTTPException(status_code=409, detail="Existe item com status ENVIANDO travado. Clique Parar para liberar e depois Reenviar/Iniciar.")
    pending = list_pending_jobs(limit=1)
    if not pending and not settings.wa_test_fallback:
      raise HTTPException(status_code=400, detail="Sem boletos pendentes. Corrija grupo/cota/telefone e escaneie novamente.")
    if not pending and settings.wa_test_fallback:
      log_debug("Sem boletos pendentes. WA_TEST_FALLBACK habilitado: iniciando worker para teste.")
    _stop_event.clear()
    _worker_last_error = None
    _worker_thread = threading.Thread(target=worker_loop, daemon=True)
    _worker_thread.start()
    log_debug("Worker thread iniciada.")
  return {"ok": True}


@app.post("/automation-api/stop")
def stop():
  global _wa_closing
  log_debug("Stop solicitado.")
  _stop_event.set()
  def _cleanup_bg():
    try:
      reset_enviando("Interrompido pelo usuário")
    except Exception:
      pass

  threading.Thread(target=_cleanup_bg, daemon=True).start()
  wa_to_close: WhatsAppWeb | None = None
  with _wa_lock:
    if _wa_instance is not None and not _wa_closing:
      _wa_closing = True
      wa_to_close = _wa_instance

  if wa_to_close is not None:
    def _close_bg():
      global _wa_closing
      try:
        wa_to_close.close()
      except Exception:
        pass
      finally:
        with _wa_lock:
          _wa_closing = False

    threading.Thread(target=_close_bg, daemon=True).start()
  return {"ok": True}


@app.post("/automation-api/jobs/{job_id}/retry")
def retry(job_id: str):
  conn = get_conn()
  try:
    cur = conn.cursor()
    cur.execute('SELECT id FROM "BoletoEnvio" WHERE id = %s', (job_id,))
    if not cur.fetchone():
      raise HTTPException(status_code=404, detail="Job não encontrado")
    cur.execute('UPDATE "BoletoEnvio" SET status=%s, erro=NULL, "updatedAt"=CURRENT_TIMESTAMP WHERE id=%s', ("RETRY", job_id))
    conn.commit()
  finally:
    try:
      conn.close()
    except Exception:
      pass
  return {"ok": True}
