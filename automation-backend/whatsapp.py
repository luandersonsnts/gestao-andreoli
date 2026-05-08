import os
import time
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import (
  ElementClickInterceptedException,
  ElementNotInteractableException,
  StaleElementReferenceException,
  TimeoutException,
  WebDriverException,
)
from selenium.webdriver import ChromeOptions
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


def _xpath_literal(value: str) -> str:
  if "'" not in value:
    return f"'{value}'"
  if '"' not in value:
    return f'"{value}"'
  parts = value.split("'")
  out = []
  for i, p in enumerate(parts):
    if p:
      out.append(f"'{p}'")
    if i != len(parts) - 1:
      out.append("\"'\"")
  return "concat(" + ", ".join(out) + ")"


class WhatsAppWeb:
  def __init__(self, profile_dir: Path, headless: bool):
    self._profile_dir = profile_dir
    self._headless = headless
    self._driver: webdriver.Chrome | None = None

  def _log(self, msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[WA {ts}] {msg}", flush=True)

  def _has_qr(self, d: webdriver.Chrome) -> bool:
    selectors = [
      "div[data-testid='qrcode']",
      "div[data-ref] canvas",
      "canvas[aria-label*='QR']",
      "canvas[aria-label*='qr']",
      "img[alt*='QR']",
      "img[alt*='qr']",
      "canvas",
    ]
    for sel in selectors:
      try:
        if d.find_elements(By.CSS_SELECTOR, sel):
          return True
      except Exception:
        continue
    return False

  def _get_driver(self) -> webdriver.Chrome:
    if self._driver is not None:
      return self._driver

    debugger = (os.environ.get("WA_DEBUGGER_ADDRESS", "") or "").strip()
    opts = ChromeOptions()
    if debugger:
      self._log(f"Anexando ao Chrome já aberto (debuggerAddress={debugger})")
      opts.add_experimental_option("debuggerAddress", debugger)
    else:
      opts.add_argument(f"--user-data-dir={str(self._profile_dir)}")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--start-maximized")
    if self._headless:
      opts.add_argument("--headless=new")
    self._driver = webdriver.Chrome(options=opts)
    return self._driver

  def close(self):
    if self._driver is None:
      return
    try:
      self._driver.quit()
    finally:
      self._driver = None

  def abrir_whatsapp(self, timeout_sec: int = 600, stop_event: Any | None = None):
    d = self._get_driver()
    d.get("https://web.whatsapp.com/")
    self._log("Abrindo WhatsApp Web…")
    deadline = time.time() + float(timeout_sec)
    while True:
      if stop_event is not None and getattr(stop_event, "is_set", lambda: False)():
        raise RuntimeError("Operação cancelada")
      if d.find_elements(By.CSS_SELECTOR, "div[data-testid='chat-list'], div[data-testid='chatlist-header'], div[aria-label='Lista de conversas']"):
        self._log("WhatsApp Web pronto.")
        return
      if self._has_qr(d):
        deadline = time.time() + float(timeout_sec)
        time.sleep(1.0)
        continue
      if time.time() > deadline:
        title = ""
        url = ""
        try:
          title = d.title or ""
          url = d.current_url or ""
        except Exception:
          pass
        extra = ""
        if title or url:
          extra = f" (title={title!r}, url={url!r})"
        raise RuntimeError("WhatsApp Web não está pronto (faça login/QR no Chrome e tente novamente)" + extra)
      time.sleep(0.5)

  def ensure_ready(self, timeout_sec: int = 600, stop_event: Any | None = None):
    self.abrir_whatsapp(timeout_sec=timeout_sec, stop_event=stop_event)

  def _wait_chat_open(self, timeout_sec: int):
    d = self._get_driver()
    wait = WebDriverWait(d, timeout_sec)
    selectors = [
      "footer div[role='textbox'][contenteditable='true']",
      "div[data-testid='conversation-compose-box-input']",
      "span[data-testid='clip']",
      "button[aria-label='Anexar']",
      "button[aria-label='Attach']",
    ]
    last: Exception | None = None
    for sel in selectors:
      try:
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, sel)))
        return
      except Exception as e:
        last = e
        continue
    raise RuntimeError("Conversa não abriu no WhatsApp Web (sem caixa de mensagem/anexo)") from last

  def _click_first(self, wait: WebDriverWait, selectors: list[str], err: str):
    last: Exception | None = None
    for sel in selectors:
      try:
        d = getattr(wait, "_driver", None)
        el = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, sel)))
        try:
          wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
        except Exception:
          pass
        try:
          el.click()
        except (ElementClickInterceptedException, ElementNotInteractableException, WebDriverException):
          try:
            el.location_once_scrolled_into_view
          except Exception:
            pass
          try:
            if d is None:
              raise RuntimeError("Driver não disponível para ActionChains")
            ActionChains(d).move_to_element(el).click(el).perform()
          except Exception:
            try:
              if d is None:
                raise RuntimeError("Driver não disponível para execute_script")
              d.execute_script("arguments[0].click();", el)
            except Exception as e:
              raise e
        return
      except Exception as e:
        last = e
        continue
    raise RuntimeError(err) from last

  def _click_element(self, el: Any):
    d = self._get_driver()
    try:
      el.click()
      return
    except (ElementClickInterceptedException, ElementNotInteractableException, WebDriverException):
      try:
        ActionChains(d).move_to_element(el).click(el).perform()
        return
      except Exception:
        d.execute_script("arguments[0].click();", el)

  def _send_text_to_box(self, box: Any, text: str):
    if not text:
      return
    has_non_bmp = any(ord(ch) > 0xFFFF for ch in text)
    if has_non_bmp:
      try:
        import tkinter as tk

        r = tk.Tk()
        try:
          r.withdraw()
          r.clipboard_clear()
          r.clipboard_append(text)
          r.update()
        finally:
          try:
            r.destroy()
          except Exception:
            pass
        box.send_keys(Keys.CONTROL, "v")
        return
      except Exception:
        pass
    box.send_keys("".join([ch for ch in text if ord(ch) <= 0xFFFF]))

  def buscar_contato(self, nome: str, timeout_sec: int = 30):
    d = self._get_driver()
    self.abrir_whatsapp(timeout_sec=timeout_sec)
    wait = WebDriverWait(d, timeout_sec)
    self._log(f"Buscando contato (query): {nome!r}")

    search_selectors = [
      "div[data-testid='chat-list-search'] div[role='textbox']",
      "div[data-testid='chat-list-search'] div[contenteditable='true']",
      "div[aria-label='Pesquisar ou começar uma nova conversa']",
      "div[title='Pesquisar ou começar uma nova conversa']",
      "div[role='textbox'][contenteditable='true'][data-tab='3']",
    ]
    last: Exception | None = None
    box = None
    for sel in search_selectors:
      try:
        box = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, sel)))
        break
      except Exception as e:
        last = e
        continue
    if box is None:
      raise RuntimeError("Não encontrou a caixa de pesquisa do WhatsApp Web") from last

    try:
      box.click()
      box.send_keys(Keys.CONTROL, "a")
      box.send_keys(nome)
    except Exception as e:
      raise RuntimeError("Falha ao digitar na pesquisa do WhatsApp Web") from e

    contains_xpath = f"//span[@title and contains(@title, {_xpath_literal(nome)})]"

    def _find_result(_d):
      els2 = _d.find_elements(By.XPATH, contains_xpath)
      if els2:
        return els2[0]
      cells = _d.find_elements(By.CSS_SELECTOR, "div[data-testid='cell-frame-container'], div[role='listitem']")
      if cells:
        return cells[0]
      return None

    try:
      el = wait.until(_find_result)
      el.click()
    except TimeoutException as e:
      raise RuntimeError(f"Contato não encontrado no WhatsApp: {nome}") from e

    self._wait_chat_open(timeout_sec=timeout_sec)
    self._log("Conversa aberta.")

  def _abrir_chat_por_telefone(self, phone: str, timeout_sec: int):
    d = self._get_driver()
    digits = "".join([c for c in phone if c.isdigit()])
    if not digits:
      raise RuntimeError("Telefone inválido")
    self.abrir_whatsapp(timeout_sec=min(45, timeout_sec))
    self._log(f"Abrindo chat por telefone: {digits}")
    d.get(f"https://web.whatsapp.com/send?phone={digits}&app_absent=0")
    self._wait_chat_open(timeout_sec=min(45, timeout_sec))

  def enviar_mensagem(self, texto: str, timeout_sec: int = 20):
    if not texto:
      return
    d = self._get_driver()
    wait = WebDriverWait(d, timeout_sec)
    box = wait.until(
      EC.presence_of_element_located(
        (By.CSS_SELECTOR, "footer div[role='textbox'][contenteditable='true'], div[data-testid='conversation-compose-box-input']")
      )
    )
    box.click()
    self._send_text_to_box(box, texto)
    box.send_keys(Keys.ENTER)
    self._log("Mensagem enviada.")

  def _score_file_input(self, el: Any) -> int:
    try:
      accept = (el.get_attribute("accept") or "").lower()
    except Exception:
      accept = ""
    score = 0
    if "pdf" in accept:
      score += 3
    if "*/*" in accept or accept.strip() == "*":
      score += 2
    if "image" in accept:
      score -= 2
    try:
      if not el.is_enabled():
        score -= 5
    except Exception:
      pass
    return score

  def _anexar_arquivo(self, file_path: str, timeout_sec: int):
    d = self._get_driver()
    wait_short = WebDriverWait(d, min(20, timeout_sec))

    self._log("Abrindo menu de anexo…")
    self._click_first(
      wait_short,
      [
        "span[data-testid='clip']",
        "button[aria-label='Anexar']",
        "button[aria-label='Attach']",
        "div[aria-label='Anexar']",
        "div[aria-label='Attach']",
        "button[title='Anexar']",
        "button[title='Attach']",
        "div[title='Anexar']",
        "div[title='Attach']",
        "span[data-icon='clip']",
        "span[data-icon='plus']",
      ],
      "Não conseguiu abrir o anexo no WhatsApp Web"
    )

    self._log("Selecionando tipo: Documento…")
    try:
      self._click_first(
        wait_short,
        [
          "[data-testid='attach-document']",
          "button[aria-label='Documento']",
          "button[aria-label='Document']",
          "div[aria-label='Documento']",
          "div[aria-label='Document']",
          "span[data-icon='attach-document']",
        ],
        "Não conseguiu selecionar o tipo de anexo (Documento)"
      )
    except Exception:
      self._log("Não conseguiu clicar em Documento (seguindo mesmo assim).")
      pass

    inputs = d.find_elements(By.CSS_SELECTOR, "input[type='file']")
    if not inputs:
      raise RuntimeError("Não encontrou input de arquivo para anexar")
    scored = sorted([(self._score_file_input(el), el) for el in inputs], key=lambda t: t[0], reverse=True)

    resolved = str(Path(file_path).resolve())
    file_name = Path(resolved).name

    attached = False
    attach_err: Exception | None = None
    input_info: list[str] = []
    for score, el in scored:
      try:
        accept = (el.get_attribute("accept") or "")
      except Exception:
        accept = ""
      try:
        enabled = el.is_enabled()
      except Exception:
        enabled = False
      try:
        displayed = el.is_displayed()
      except Exception:
        displayed = False
      input_info.append(f"score={score} accept={accept!r} enabled={enabled} displayed={displayed}")
    self._log("Inputs file encontrados: " + " | ".join(input_info))

    for _score, inp in scored:
      try:
        try:
          d.execute_script(
            "arguments[0].style.display='block'; arguments[0].style.visibility='visible'; arguments[0].style.opacity=1; arguments[0].style.height='1px'; arguments[0].style.width='1px'; arguments[0].style.position='fixed'; arguments[0].style.left='0'; arguments[0].style.top='0'; arguments[0].removeAttribute('disabled');",
            inp,
          )
        except Exception:
          pass
        try:
          d.execute_script("arguments[0].scrollIntoView(true);", inp)
        except Exception:
          pass

        inp.send_keys(resolved)
        self._log("Arquivo selecionado no input file.")
        try:
          WebDriverWait(d, 30).until(lambda _d: _d.find_elements(By.CSS_SELECTOR, "div[role='dialog'], div[aria-modal='true']"))
          attached = True
          self._log("Modal de envio do anexo apareceu.")
          break
        except Exception:
          pass
        try:
          WebDriverWait(d, 30).until(
            EC.presence_of_element_located(
              (By.XPATH, f"//*[contains(@title, {_xpath_literal(file_name)}) or contains(normalize-space(text()), {_xpath_literal(file_name)})]")
            )
          )
          attached = True
          self._log("Preview do anexo detectado.")
          break
        except Exception:
          continue
      except (ElementNotInteractableException, StaleElementReferenceException, WebDriverException, Exception) as e:
        attach_err = e
        msg = str(e) or type(e).__name__
        if "invalid session id" in msg.lower():
          self._log("Sessão do Chrome inválida durante anexo. Reiniciando driver e abortando esta tentativa.")
          try:
            self.close()
          except Exception:
            pass
        continue

    if not attached:
      raise RuntimeError("Falha ao anexar: o WhatsApp não confirmou o upload/preview do arquivo") from attach_err

  def enviar_boleto(self, pdf_path: str, message: str = "", timeout_sec: int = 150):
    d = self._get_driver()
    resolved = str(Path(pdf_path).resolve())
    file_name = Path(resolved).name
    wait = WebDriverWait(d, timeout_sec)

    self._log(f"Anexando boleto: {file_name}")
    if message:
      try:
        self.enviar_mensagem(message, timeout_sec=20)
      except Exception as e:
        self._log(f"Falha ao enviar mensagem antes do anexo (seguindo): {e}")
    self._anexar_arquivo(resolved, timeout_sec=timeout_sec)

    dialog = None
    try:
      dialog = wait.until(lambda _d: (_d.find_elements(By.CSS_SELECTOR, "div[role='dialog'], div[aria-modal='true']") or [None])[0])
    except Exception:
      dialog = None

    if dialog is not None:
      typed_caption = False
      if message:
        try:
          caption = dialog.find_elements(By.CSS_SELECTOR, "div[role='textbox'], div[contenteditable='true'][role='textbox']")
          if caption:
            caption[0].click()
            self._send_text_to_box(caption[0], message)
            typed_caption = True
        except Exception:
          pass

      send_deadline = time.time() + min(120, float(timeout_sec))
      send_btn = None
      while time.time() < send_deadline:
        try:
          btns = dialog.find_elements(By.CSS_SELECTOR, "button, div[role='button'], span")
        except Exception:
          btns = []
        candidates: list[Any] = []
        for el in btns:
          try:
            if not el.is_displayed():
              continue
          except Exception:
            continue
          try:
            tag = (el.tag_name or "").lower()
          except Exception:
            tag = ""
          candidates.append(el)
          if tag == "span":
            try:
              candidates.append(el.find_element(By.XPATH, "./ancestor::button[1]"))
            except Exception:
              pass

        for el in candidates:
          try:
            dtid = (el.get_attribute("data-testid") or "").lower()
            aria = (el.get_attribute("aria-label") or "").lower()
            icon = (el.get_attribute("data-icon") or "").lower()
            if ("send" not in dtid) and ("enviar" not in aria) and ("send" not in aria) and ("send" not in icon):
              continue
            target = el
            try:
              if (icon or "").find("send") >= 0 and (getattr(el, "tag_name", "") or "").lower() == "span":
                target = el.find_element(By.XPATH, "./ancestor::button[1]")
            except Exception:
              target = el
            if target.is_enabled():
              send_btn = target
              break
          except Exception:
            continue
        if send_btn is not None:
          break
        time.sleep(0.25)

      if send_btn is None:
        raise RuntimeError("Não conseguiu habilitar o botão Enviar no preview do WhatsApp (upload pode ter travado)")

      try:
        self._click_element(send_btn)
      except Exception:
        try:
          ActionChains(d).send_keys(Keys.ENTER).perform()
        except Exception as e:
          raise RuntimeError("Não conseguiu clicar/enviar no preview do WhatsApp Web") from e

      closed = False
      close_deadline = time.time() + min(60, float(timeout_sec))
      while time.time() < close_deadline:
        try:
          if not d.find_elements(By.CSS_SELECTOR, "div[role='dialog'], div[aria-modal='true']"):
            closed = True
            break
        except Exception:
          pass
        time.sleep(0.25)
      if not closed:
        raise RuntimeError("Preview do WhatsApp não fechou após enviar (trava no PREVIEW)")

      if message and not typed_caption:
        try:
          self.enviar_mensagem(message, timeout_sec=20)
        except Exception:
          pass
      self._log("Boleto enviado.")
      return

    try:
      wait.until(
        EC.presence_of_element_located(
          (By.XPATH, f"//*[contains(@title, {_xpath_literal(file_name)}) or contains(normalize-space(text()), {_xpath_literal(file_name)})]")
        )
      )
    except TimeoutException as e:
      raise RuntimeError("O WhatsApp não confirmou o anexo do arquivo (upload não iniciou)") from e

    try:
      send_btn = wait.until(
        EC.element_to_be_clickable(
          (
            By.CSS_SELECTOR,
            "span[data-testid='send'], span[data-icon='send'], button[aria-label='Enviar'], button[aria-label='Send']",
          )
        )
      )
      self._click_element(send_btn)
    except TimeoutException as e:
      raise RuntimeError("Não conseguiu clicar em Enviar no WhatsApp Web") from e

    if message:
      try:
        self.enviar_mensagem(message, timeout_sec=20)
      except Exception:
        pass

    self._log("Boleto enviado.")

  def send_boleto(self, *, contact_name: str | None, phone: str | None, message: str, pdf_path: str, timeout_sec: int = 150):
    if not Path(pdf_path).exists():
      raise RuntimeError(f"Arquivo PDF não encontrado: {pdf_path}")
    if contact_name:
      try:
        self.buscar_contato(contact_name, timeout_sec=min(45, timeout_sec))
        self.enviar_boleto(pdf_path, message=message, timeout_sec=timeout_sec)
        return
      except Exception as e:
        if phone:
          self._log(f"Falha ao enviar por contato ({contact_name!r}); tentando por telefone… ({e})")
        else:
          raise
    if phone:
      self._abrir_chat_por_telefone(phone, timeout_sec=timeout_sec)
      self.enviar_boleto(pdf_path, message=message, timeout_sec=timeout_sec)
      return
    raise RuntimeError("É necessário informar contact_name ou phone")

  def send_pdf(self, phone: str, message: str, pdf_path: str, timeout_sec: int = 150):
    self.send_boleto(contact_name=None, phone=phone, message=message, pdf_path=pdf_path, timeout_sec=timeout_sec)
