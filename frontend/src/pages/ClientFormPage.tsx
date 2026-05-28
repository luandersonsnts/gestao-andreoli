import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createClient, deleteClient, getClient, updateClient, uploadClientPhoto } from "../api/api";
import type { CotaInput, Cliente } from "../api/types";
import { getApiUrl } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import type { ApiError } from "../api/http";
import { PageHeader } from "../components/PageHeader";
import { PhoneInput, displayPhone, unmaskPhone } from "../components/PhoneInput";

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toIsoOrNull(dateInput: string): string | null {
  if (!dateInput) return null;
  const d = new Date(`${dateInput}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isValidDateValue(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function emptyCota(): CotaInput {
  return {
    grupo: "",
    cota: "",
    dataEntrada: new Date().toISOString(),
    status: "ativo",
    administradora: "",
    assembleiaDia: null,
    vencimentoDiaMensal: null,
    antecedenciaPrimeiraParcelaDias: null,
    contemplado: false,
    parcelaContemplacao: null,
    dataContemplacao: null,
    parcela1: null,
    parcela2: null,
    parcela3: null,
    parcela4: null,
    parcela5: null
  };
}

function verificarPrimeiraParcelaPaga(cotas: CotaInput[]): boolean {
  return cotas.some(c => c.parcela1 != null);
}

export function ClientFormPage({ mode }: { mode: "create" | "edit" }) {
  const { state } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id ?? null;

  const [loaded, setLoaded] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [categoria, setCategoria] = useState<"VIP" | "NORMAL" | "RISCO">("NORMAL");
  const [pontuacaoRanking, setPontuacaoRanking] = useState<number>(0);
  const [statusCliente, setStatusCliente] = useState<"ativo" | "desistente" | "excluido">("ativo");
  const [motivoDesistencia, setMotivoDesistencia] = useState<string>("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [tirouFoto, setTirouFoto] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [cotas, setCotas] = useState<CotaInput[]>([emptyCota()]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" }>({
    open: false,
    message: "",
    severity: "success"
  });
  const [expanded, setExpanded] = useState<number | null>(0);

  useEffect(() => {
    if (mode === "create") {
      setLoaded(true);
      return;
    }
    if (!id) return;
    void (async () => {
      const r = await getClient(id);
      setCliente(r.cliente);
      setNome(r.cliente.nome);
      setTelefone(displayPhone(r.cliente.telefone));
      setCategoria(r.cliente.categoria ?? "NORMAL");
      setPontuacaoRanking(Number.isFinite(r.cliente.pontuacaoRanking) ? r.cliente.pontuacaoRanking : 0);
      setStatusCliente(r.cliente.statusCliente ?? "ativo");
      setMotivoDesistencia(r.cliente.motivoDesistencia ?? "");
      setDataNascimento(toDateInput(r.cliente.dataNascimento));
      setTirouFoto(r.cliente.tirouFoto);
      setObservacoes(r.cliente.observacoes ?? "");
      setCotas(
        r.cliente.cotas.map((c) => ({
          grupo: c.grupo,
          cota: c.cota,
          dataEntrada: c.dataEntrada,
          status: c.status ?? "ativo",
          administradora: c.administradora,
          assembleiaDia: c.assembleiaDia,
          vencimentoDiaMensal: c.vencimentoDiaMensal,
          antecedenciaPrimeiraParcelaDias: c.antecedenciaPrimeiraParcelaDias,
          contemplado: c.contemplado,
          parcelaContemplacao: c.parcelaContemplacao,
          dataContemplacao: c.dataContemplacao,
          parcela1: c.parcela1,
          parcela2: c.parcela2,
          parcela3: c.parcela3,
          parcela4: c.parcela4,
          parcela5: c.parcela5
        }))
      );
      setLoaded(true);
    })();
  }, [mode, id]);

  const isVipPreview = useMemo(() => cotas.length > 2, [cotas.length]);
  const canEdit = state.status === "authenticated" && state.user.role !== "LEITURA";
  const canDelete = state.status === "authenticated" && state.user.role === "ADMIN";

  // Derived state for the UI Toggle
  const hasPrimeiraParcela = verificarPrimeiraParcelaPaga(cotas);
  const estadoVisual = statusCliente === "desistente" 
    ? "desistente" 
    : statusCliente === "excluido" 
      ? "excluido"
      : (hasPrimeiraParcela ? "ativo" : "inativo_auto");

  // When changing status manually
  const handleStatusChange = (newStatus: "ativo" | "desistente" | "excluido") => {
    setStatusCliente(newStatus);
    if (newStatus === "desistente" && !motivoDesistencia) {
      setMotivoDesistencia("Desistiu após pagamento inicial");
    } else if (newStatus === "excluido" && !motivoDesistencia) {
      setMotivoDesistencia("Não pagou a primeira parcela");
    }
  };

  const onSave = async () => {
    if (!canEdit) return;
    if (busy) return;

    if (!nome.trim()) {
      setSnack({ open: true, severity: "error", message: "Informe o nome completo." });
      return;
    }

    // Alertas (Confirmações)
    let telefoneFormatado = unmaskPhone(telefone);
    if (!telefoneFormatado.trim()) {
      if (!window.confirm("Aviso: Cliente sem telefone. Deseja salvar mesmo assim?")) return;
    }

    if (nome.trim().split(" ").length < 2) {
      if (!window.confirm("Aviso: Nome parece estar incompleto (sem sobrenome). Deseja salvar mesmo assim?")) return;
    }

    if (statusCliente === "desistente" && !motivoDesistencia.trim()) {
      if (!window.confirm("Aviso: Cliente desistente, mas sem motivo. Deseja salvar mesmo assim?")) return;
    }
    if (statusCliente === "excluido" && !motivoDesistencia.trim()) {
      if (!window.confirm("Aviso: Cliente excluído, mas sem motivo. Deseja salvar mesmo assim?")) return;
    }

    if (dataNascimento) {
      const birthIso = toIsoOrNull(dataNascimento);
      if (!birthIso) {
        setSnack({ open: true, severity: "error", message: "Informe uma data de nascimento válida." });
        return;
      }
    }
    for (let i = 0; i < cotas.length; i += 1) {
      const c = cotas[i]!;
      if (c.status === "inativo") continue; // Pula validações para cotas inativas
      if (!c.grupo.trim() || !c.cota.trim()) {
        setExpanded(i);
        setSnack({ open: true, severity: "error", message: `Preencha Grupo e Cota na cota #${i + 1}.` });
        return;
      }
      if (!c.administradora.trim()) {
        setExpanded(i);
        setSnack({ open: true, severity: "error", message: `Preencha Administradora na cota #${i + 1}.` });
        return;
      }
      if (c.contemplado && (!c.dataContemplacao || !c.parcelaContemplacao)) {
        setExpanded(i);
        setSnack({ open: true, severity: "error", message: `Preencha os campos obrigatórios da contemplação na cota #${i + 1}.` });
        return;
      }
      if (!c.dataEntrada || !isValidDateValue(c.dataEntrada)) {
        setExpanded(i);
        setSnack({ open: true, severity: "error", message: `Informe uma Data de entrada válida na cota #${i + 1}.` });
        return;
      }
    }

    setBusy(true);

    const isDesistente = statusCliente === "desistente" || statusCliente === "excluido";
    let dataDesist = cliente?.dataDesistencia;
    if (isDesistente && !dataDesist) {
      dataDesist = new Date().toISOString();
    } else if (!isDesistente) {
      dataDesist = null;
    }

    const payload = {
      nome,
      telefone: telefoneFormatado ? telefoneFormatado : null,
      pontuacaoRanking: Number.isFinite(pontuacaoRanking) ? pontuacaoRanking : 0,
      categoria,
      active: statusCliente === "ativo" && hasPrimeiraParcela,
      statusCliente,
      motivoDesistencia: isDesistente ? (motivoDesistencia || null) : null,
      dataDesistencia: dataDesist,
      dataNascimento: toIsoOrNull(dataNascimento),
      tirouFoto,
      observacoes: observacoes || null,
      cotas: cotas.map((c) => ({
        ...c,
        dataEntrada: new Date(c.dataEntrada).toISOString(),
        status: c.status ?? "ativo",
        dataContemplacao: c.dataContemplacao ? new Date(c.dataContemplacao).toISOString() : null,
        parcela1: c.parcela1 ? new Date(c.parcela1).toISOString() : null,
        parcela2: c.parcela2 ? new Date(c.parcela2).toISOString() : null,
        parcela3: c.parcela3 ? new Date(c.parcela3).toISOString() : null,
        parcela4: c.parcela4 ? new Date(c.parcela4).toISOString() : null,
        parcela5: c.parcela5 ? new Date(c.parcela5).toISOString() : null
      }))
    };

    try {
      if (mode === "create") {
        const r = await createClient(payload);
        if (photoFile) {
          await uploadClientPhoto(r.cliente.id, photoFile);
        }
      } else if (id) {
        await updateClient(id, payload);
        if (photoFile) {
          await uploadClientPhoto(id, photoFile);
        }
      }

      navigate("/clients", { replace: true, state: { toast: "Cliente salvo com sucesso" } });
    } catch (e) {
      const err = e as ApiError;
      setSnack({ open: true, severity: "error", message: err.message ?? "Falha ao salvar" });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!canDelete) return;
    if (!id) return;
    await deleteClient(id);
    navigate("/clients");
  };

  if (!loaded) return null;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <PageHeader
          title={mode === "create" ? "Novo cliente" : "Editar cliente"}
          subtitle={isVipPreview ? "Cliente VIP (mais de 2 cotas)" : undefined}
          titleProps={{ color: isVipPreview ? "warning.main" : "text.primary" }}
          action={
            <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "center" }}>
              {mode === "edit" && canDelete ? (
                <Button color="error" variant="outlined" onClick={onDelete} sx={{ width: { xs: "100%", sm: "auto" } }}>
                  Excluir
                </Button>
              ) : null}
              <Button
                variant="contained"
                onClick={onSave}
                disabled={busy || !canEdit || !nome || cotas.length === 0}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Salvar
              </Button>
            </Stack>
          }
        />
      </Grid>

      {!canEdit ? (
        <Grid item xs={12}>
          <Alert severity="info">Seu perfil é somente leitura. Você pode visualizar, mas não pode editar.</Alert>
        </Grid>
      ) : null}

      <Grid item xs={12} md={8}>
        <Card>
          <CardContent sx={{ display: "grid", gap: 2 }}>
            <Typography variant="h6">Dados do Cliente</Typography>
            <TextField
              label="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              fullWidth
              disabled={!canEdit}
            />
            <PhoneInput
              label="Telefone (WhatsApp com DDD)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              fullWidth
              disabled={!canEdit}
            />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" disabled={!canEdit}>
                  <InputLabel id="categoria-label">Categoria</InputLabel>
                  <Select
                    labelId="categoria-label"
                    label="Categoria"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as any)}
                  >
                    <MenuItem value="VIP">VIP</MenuItem>
                    <MenuItem value="NORMAL">NORMAL</MenuItem>
                    <MenuItem value="RISCO">RISCO</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Pontuação (ranking)"
                  type="number"
                  value={String(pontuacaoRanking)}
                  onChange={(e) => setPontuacaoRanking(e.target.value ? Number(e.target.value) : 0)}
                  fullWidth
                  disabled={!canEdit}
                  size="small"
                />
              </Grid>
            </Grid>
            <Box sx={{ border: "1px solid", borderColor: "divider", p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Status e Situação do Cliente</Typography>
              <FormControl fullWidth size="small" disabled={!canEdit} sx={{ mb: 2 }}>
                <InputLabel id="status-label">Status Operacional</InputLabel>
                <Select
                  labelId="status-label"
                  label="Status Operacional"
                  value={statusCliente}
                  onChange={(e) => handleStatusChange(e.target.value as "ativo" | "desistente" | "excluido")}
                  renderValue={(val) => {
                    if (val === "desistente") return "❌ Desistente (manual)";
                    if (val === "excluido") return "🗑️ Excluído (não pagou 1ª)";
                    if (val === "ativo" && !hasPrimeiraParcela) return "⚠️ Inativo (não pagou 1ª parcela)";
                    return "✅ Cliente ativo";
                  }}
                >
                  <MenuItem value="ativo">
                    {hasPrimeiraParcela ? "✅ Cliente ativo" : "⚠️ Inativo (não pagou 1ª parcela)"}
                  </MenuItem>
                  <MenuItem value="desistente">❌ Desistente (após pagar)</MenuItem>
                  <MenuItem value="excluido">🗑️ Excluído (não pagou 1ª)</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                {estadoVisual === "ativo" && "Cliente ativo normalmente."}
                {estadoVisual === "inativo_auto" && "Cliente ainda não efetuou o pagamento da 1ª parcela."}
                {estadoVisual === "desistente" && "Cliente desistiu da cota."}
                {estadoVisual === "excluido" && "Cliente foi excluído por falta de pagamento inicial."}
              </Typography>

              {(statusCliente === "desistente" || statusCliente === "excluido") && (
                <TextField
                  label="Motivo da desistência"
                  value={motivoDesistencia}
                  onChange={(e) => setMotivoDesistencia(e.target.value)}
                  fullWidth
                  disabled={!canEdit}
                  size="small"
                />
              )}
            </Box>
            <TextField
              label="Data de nascimento"
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
              fullWidth
              disabled={!canEdit}
              InputLabelProps={{ shrink: true }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={tirouFoto}
                  onChange={(e) => setTirouFoto(e.target.checked)}
                  disabled={!canEdit}
                  color="success"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: "success.main"
                    }
                  }}
                />
              }
              label="Tirou foto conosco?"
            />
            <TextField
              label="Observações adicionais"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent sx={{ display: "grid", gap: 2 }}>
            <Typography variant="subtitle1">Foto de perfil</Typography>
            <Box
              sx={{
                width: "100%",
                aspectRatio: "1 / 1",
                bgcolor: "grey.100",
                borderRadius: 2,
                backgroundImage:
                  photoFile
                    ? `url(${URL.createObjectURL(photoFile)})`
                    : cliente?.fotoPath
                      ? `url(${getApiUrl()}${cliente.fotoPath})`
                      : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center"
              }}
            />
            <Button component="label" variant="outlined" disabled={!canEdit}>
              Selecionar imagem
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </Button>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent sx={{ display: "grid", gap: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1}>
              <Typography variant="h6">Cotas</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={() => {
                  setCotas((prev) => {
                    const next = [...prev, emptyCota()];
                    setExpanded(next.length - 1);
                    return next;
                  });
                }}
                variant="outlined"
                disabled={!canEdit}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Adicionar cota
              </Button>
            </Stack>

            {cotas.map((c, idx) => (
              <Accordion
                key={idx}
                expanded={expanded === idx}
                onChange={(_, isExp) => setExpanded(isExp ? idx : null)}
                disableGutters
                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }} gap={1}>
                    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography variant="subtitle2" sx={{ color: c.status === "inativo" ? "text.secondary" : "text.primary", textDecoration: c.status === "inativo" ? "line-through" : "none" }}>
                        {c.grupo || "-"} - {c.cota || "-"} • {c.administradora || "Administradora"}
                      </Typography>
                      {c.status === "inativo" ? <Chip size="small" color="default" label="Cancelada / Desistente" /> : null}
                      {c.contemplado && c.status !== "inativo" ? <Chip size="small" color="success" label="Contemplado" /> : null}
                      {idx === 0 && c.status !== "inativo" ? <Chip size="small" color="default" label="Principal" /> : null}
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Typography variant="caption" color="text.secondary">
                        Entrada: {toDateInput(c.dataEntrada) || "--/--/----"}
                      </Typography>
                      <IconButton
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCotas((prev) => prev.filter((_, i) => i !== idx));
                          setExpanded((cur) => {
                            if (cur === idx) return null;
                            if (cur === null) return null;
                            return cur > idx ? cur - 1 : cur;
                          });
                        }}
                        disabled={!canEdit || cotas.length <= 1}
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Grupo"
                      value={c.grupo}
                      onChange={(e) =>
                        setCotas((prev) => prev.map((p, i) => (i === idx ? { ...p, grupo: e.target.value } : p)))
                      }
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Cota"
                      value={c.cota}
                      onChange={(e) =>
                        setCotas((prev) => prev.map((p, i) => (i === idx ? { ...p, cota: e.target.value } : p)))
                      }
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Data de entrada"
                      type="date"
                      value={toDateInput(c.dataEntrada)}
                      onChange={(e) =>
                        setCotas((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, dataEntrada: toIsoOrNull(e.target.value) ?? "" } : p))
                        )
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Administradora"
                      value={c.administradora}
                      onChange={(e) =>
                        setCotas((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, administradora: e.target.value } : p))
                        )
                      }
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControlLabel
                      sx={{
                        "& .MuiFormControlLabel-label": {
                          color: c.contemplado ? "success.main" : "text.primary",
                          fontWeight: c.contemplado ? 600 : 400
                        }
                      }}
                      control={
                        <Switch
                          checked={c.contemplado}
                          onChange={(e) =>
                            setCotas((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, contemplado: e.target.checked } : p))
                            )
                          }
                          disabled={!canEdit}
                          color="success"
                          sx={{
                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                              backgroundColor: "success.main"
                            }
                          }}
                        />
                      }
                      label="Contemplado"
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" disabled={!canEdit}>
                      <InputLabel id={`status-cota-${idx}`}>Status da Cota</InputLabel>
                      <Select
                        labelId={`status-cota-${idx}`}
                        label="Status da Cota"
                        value={c.status ?? "ativo"}
                        onChange={(e) =>
                          setCotas((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, status: e.target.value as "ativo" | "inativo" } : p))
                          )
                        }
                      >
                        <MenuItem value="ativo">Ativa (Pagando)</MenuItem>
                        <MenuItem value="inativo">Inativa / Cancelada</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <Divider />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Regras de vencimento (opcional)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Se vazio, o sistema usa padrão da administradora. Esses campos servem para calcular alertas de atraso (quando “deveria” ter sido pago), não substituem as datas dos pagamentos.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Dia da assembleia"
                      type="number"
                      value={c.assembleiaDia ?? ""}
                      onChange={(e) =>
                        setCotas((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, assembleiaDia: e.target.value ? Number(e.target.value) : null } : p
                          )
                        )
                      }
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Prazo 1ª parcela (dias antes da assembleia)"
                      type="number"
                      value={c.antecedenciaPrimeiraParcelaDias ?? ""}
                      onChange={(e) =>
                        setCotas((prev) =>
                          prev.map((p, i) =>
                            i === idx
                              ? { ...p, antecedenciaPrimeiraParcelaDias: e.target.value ? Number(e.target.value) : null }
                              : p
                          )
                        )
                      }
                      helperText="Opcional. Usado só para alertas/atraso."
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Vencimento mensal (dia)"
                      type="number"
                      value={c.vencimentoDiaMensal ?? ""}
                      onChange={(e) =>
                        setCotas((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, vencimentoDiaMensal: e.target.value ? Number(e.target.value) : null } : p
                          )
                        )
                      }
                      fullWidth
                      disabled={!canEdit}
                      size="small"
                    />
                  </Grid>

                  {c.contemplado && (
                    <>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Parcela da contemplação"
                          value={c.parcelaContemplacao ?? ""}
                          onChange={(e) =>
                            setCotas((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? { ...p, parcelaContemplacao: e.target.value ? Number(e.target.value) : null }
                                  : p
                              )
                            )
                          }
                          type="number"
                          fullWidth
                          disabled={!canEdit}
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Data de contemplação"
                          type="date"
                          value={toDateInput(c.dataContemplacao)}
                          onChange={(e) =>
                            setCotas((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, dataContemplacao: toIsoOrNull(e.target.value) } : p
                              )
                            )
                          }
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          disabled={!canEdit}
                          size="small"
                        />
                      </Grid>
                    </>
                  )}
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Pagamentos (datas)
                </Typography>

                <Grid container spacing={2}>
                  {(["parcela1", "parcela2", "parcela3", "parcela4", "parcela5"] as const).map((field) => (
                    <Grid key={field} item xs={12} sm={6} md={4}>
                      <TextField
                        label={field.toUpperCase()}
                        type="date"
                        value={toDateInput(c[field])}
                        onChange={(e) =>
                          setCotas((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, [field]: toIsoOrNull(e.target.value) } : p))
                          )
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                        disabled={!canEdit}
                        size="small"
                      />
                    </Grid>
                  ))}
                </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>
      </Grid>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Grid>
  );
}
