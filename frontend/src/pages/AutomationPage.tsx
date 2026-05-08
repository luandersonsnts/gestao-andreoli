import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAutomationDashboard, listAutomationJobs, retryAutomationJob, scanBoletos, startAutomation, stopAutomation } from "../api/api";
import type { AutomationDashboard, AutomationJob } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function AutomationPage() {
  const { state } = useAuth();
  const navigate = useNavigate();

  const [dash, setDash] = useState<AutomationDashboard | null>(null);
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshingRef = useRef(false);

  const canRead = useMemo(() => state.status === "authenticated", [state.status]);
  const canWrite = useMemo(
    () => state.status === "authenticated" && (state.user.role === "ADMIN" || state.user.role === "COMERCIAL"),
    [state.status, state.status === "authenticated" ? state.user.role : null]
  );

  const hasSending = useMemo(() => jobs.some((j) => j.status === "ENVIANDO"), [jobs]);

  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const [dashRes, jobsRes] = await Promise.allSettled([getAutomationDashboard(), listAutomationJobs()]);
      let errMsg: string | null = null;

      if (dashRes.status === "fulfilled") {
        setDash(dashRes.value);
      } else {
        errMsg = (dashRes.reason as any)?.message ?? "Falha ao carregar dashboard";
      }

      if (jobsRes.status === "fulfilled") {
        setJobs(jobsRes.value.items);
      } else {
        const m = (jobsRes.reason as any)?.message ?? "Falha ao carregar histórico";
        errMsg = errMsg ? `${errMsg} • ${m}` : m;
      }

      setError(errMsg);
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (!busy) void refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [busy]);

  if (!canRead) {
    return <Alert severity="warning">Faça login para acessar esta área.</Alert>;
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
          <Typography variant="h5">Automação - Boletos WhatsApp</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
            <Button
              variant="outlined"
              onClick={async () => {
                setBusy(true);
                try {
                  await scanBoletos();
                  await refresh();
                } catch (e: any) {
                  setError(e?.message ?? "Falha ao escanear");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !canWrite}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Escanear pasta
            </Button>
            <Button
              variant="contained"
              onClick={async () => {
                setBusy(true);
                try {
                  await startAutomation();
                  await refresh();
                } catch (e: any) {
                  setError(e?.message ?? "Falha ao iniciar");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || Boolean(dash?.workerAtivo) || !canWrite}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Iniciar envios
            </Button>
            <Button
              color="error"
              variant="outlined"
              onClick={async () => {
                setBusy(true);
                try {
                  await stopAutomation();
                  void refresh();
                } catch (e: any) {
                  setError(e?.message ?? "Falha ao parar");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || (!Boolean(dash?.workerAtivo) && !hasSending) || !canWrite}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Parar
            </Button>
          </Stack>
        </Stack>
      </Grid>

      {error ? (
        <Grid item xs={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      ) : null}

      {!error && dash?.workerErro && !dash.workerAtivo ? (
        <Grid item xs={12}>
          <Alert severity="warning">{dash.workerErro}</Alert>
        </Grid>
      ) : null}

      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Enviados hoje
                </Typography>
                <Typography variant="h4">{dash?.enviadosHoje ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Pendentes
                </Typography>
                <Typography variant="h4">{dash?.pendentes ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Erros
                </Typography>
                <Typography variant="h4">{dash?.erros ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Clientes com atraso
                </Typography>
                <Typography variant="h4">{dash?.clientesComAtraso ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Taxa de sucesso (hoje)
                </Typography>
                <Typography variant="h4">
                  {dash ? `${Math.round((dash.taxaSucessoHoje ?? 0) * 100)}%` : "-"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6">Fila e histórico</Typography>
              <Chip label={dash?.workerAtivo ? "ATIVO" : "PARADO"} color={dash?.workerAtivo ? "success" : "default"} />
            </Stack>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Arquivo</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Telefone</TableCell>
                    <TableCell>Tentativas</TableCell>
                    <TableCell>Erro</TableCell>
                    <TableCell>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id} hover>
                      <TableCell>{j.arquivo}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={j.status}
                          color={j.status === "ENVIADO" ? "success" : j.status === "ERRO" ? "error" : "default"}
                          variant={j.status === "PENDENTE" || j.status === "RETRY" ? "outlined" : "filled"}
                        />
                      </TableCell>
                      <TableCell>
                        {j.clienteId ? (
                          <Button size="small" onClick={() => navigate(`/clients/${j.clienteId}`)}>
                            {j.clienteNome ?? "Abrir"}
                          </Button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{j.telefone ?? "-"}</TableCell>
                      <TableCell>{j.tentativas}</TableCell>
                      <TableCell sx={{ maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {j.erro ?? "-"}
                      </TableCell>
                      <TableCell>
                        {j.status === "ERRO" && canWrite ? (
                          <Button
                            size="small"
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await retryAutomationJob(j.id);
                                await refresh();
                              } catch (e: any) {
                                setError(e?.message ?? "Falha ao reenviar");
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            Reenviar
                          </Button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography variant="body2" color="text.secondary">
                          Sem registros ainda.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
