import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Snackbar,
  TextField,
  Typography
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { listClients } from "../api/api";
import type { ClienteListItem } from "../api/types";
import { getApiUrl } from "../api/http";
import { useAuth } from "../auth/AuthContext";

const pageSize = 20;

export function ClientsPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<ClienteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [onlyContemplados, setOnlyContemplados] = useState(false);
  const [onlyNaoContemplados, setOnlyNaoContemplados] = useState(false);
  const [onlyVip, setOnlyVip] = useState(false);
  const [semFoto, setSemFoto] = useState(false);
  const [contempladoSemFoto, setContempladoSemFoto] = useState(false);
  const [parcelasEmAberto, setParcelasEmAberto] = useState(false);

  useEffect(() => {
    const vip = searchParams.get("vip");
    const contemplado = searchParams.get("contemplado");
    const semFotoParam = searchParams.get("semFoto");
    const contempladoSemFotoParam = searchParams.get("contempladoSemFoto");
    const atraso = searchParams.get("atraso");
    const qParam = searchParams.get("q");

    if (qParam) setQ(qParam);

    if (vip === "1") setOnlyVip(true);
    if (atraso === "1") setParcelasEmAberto(true);

    if (contemplado === "sim") {
      setOnlyContemplados(true);
      setOnlyNaoContemplados(false);
    } else if (contemplado === "nao") {
      setOnlyNaoContemplados(true);
      setOnlyContemplados(false);
    }

    if (contempladoSemFotoParam === "1") {
      setContempladoSemFoto(true);
      setSemFoto(false);
    } else if (semFotoParam === "1") {
      setSemFoto(true);
      setContempladoSemFoto(false);
    }
  }, []);

  const contempladoFilter = useMemo<"sim" | "nao" | undefined>(() => {
    if (onlyContemplados && !onlyNaoContemplados) return "sim";
    if (onlyNaoContemplados && !onlyContemplados) return "nao";
    return undefined;
  }, [onlyContemplados, onlyNaoContemplados]);

  useEffect(() => {
    void (async () => {
      setLoadError(null);
      const skip = (page - 1) * pageSize;
      try {
        const r = await listClients({
          q: q || undefined,
          contemplado: contempladoFilter,
          multiplasCotas: onlyVip,
          semFoto,
          contempladoSemFoto,
          parcelasEmAberto,
          take: pageSize,
          skip
        });
        setItems(r.items);
        setTotal(r.total);
      } catch (e: any) {
        setItems([]);
        setTotal(0);
        setLoadError(e?.message ?? "Falha ao carregar clientes");
      }
    })();
  }, [q, contempladoFilter, onlyVip, semFoto, contempladoSemFoto, parcelasEmAberto, page]);

  useEffect(() => {
    const msg = location?.state?.toast;
    if (typeof msg === "string" && msg) {
      setToast(msg);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canEdit = state.status === "authenticated" && state.user.role !== "LEITURA";

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }} justifyContent="space-between">
          <Typography variant="h5">Clientes</Typography>
          {canEdit ? (
            <Button variant="contained" onClick={() => navigate("/clients/new")}>
              Novo cliente
            </Button>
          ) : null}
        </Stack>
      </Grid>

      <Grid item xs={12}>
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <TextField
                  label="Busca rápida (nome)"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Chip
                    label="Contemplados"
                    clickable
                    color={onlyContemplados ? "success" : "default"}
                    variant={onlyContemplados ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setOnlyContemplados((prev) => {
                        const next = !prev;
                        if (next) setOnlyNaoContemplados(false);
                        return next;
                      });
                    }}
                  />
                  <Chip
                    label="Não contemplados"
                    clickable
                    color={onlyNaoContemplados ? "warning" : "default"}
                    variant={onlyNaoContemplados ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setOnlyNaoContemplados((prev) => {
                        const next = !prev;
                        if (next) setOnlyContemplados(false);
                        return next;
                      });
                    }}
                  />
                  <Chip
                    label="Múltiplas cotas (VIP)"
                    clickable
                    color={onlyVip ? "primary" : "default"}
                    variant={onlyVip ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setOnlyVip((prev) => !prev);
                    }}
                  />
                  <Chip
                    label="Sem foto"
                    clickable
                    color={semFoto ? "info" : "default"}
                    variant={semFoto ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setSemFoto((prev) => !prev);
                      setContempladoSemFoto(false);
                    }}
                  />
                  <Chip
                    label="Contemplado sem foto"
                    clickable
                    color={contempladoSemFoto ? "error" : "default"}
                    variant={contempladoSemFoto ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setContempladoSemFoto((prev) => {
                        const next = !prev;
                        if (next) setSemFoto(false);
                        return next;
                      });
                    }}
                  />
                  <Chip
                    label="Parcelas em atraso"
                    clickable
                    color={parcelasEmAberto ? "error" : "default"}
                    variant={parcelasEmAberto ? "filled" : "outlined"}
                    onClick={() => {
                      setPage(1);
                      setParcelasEmAberto((prev) => !prev);
                    }}
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Cotas</TableCell>
                    <TableCell>Contemplação</TableCell>
                    <TableCell>Foto</TableCell>
                    <TableCell>Alertas</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/clients/${c.id}`)}>
                      <TableCell>
                        <Stack direction="row" gap={1} alignItems="center">
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              bgcolor: "grey.200",
                              backgroundImage: c.fotoPath ? `url(${getApiUrl()}${c.fotoPath})` : undefined,
                              backgroundSize: "cover",
                              backgroundPosition: "center"
                            }}
                          />
                          <Stack>
                            <Typography variant="body2">{c.nome}</Typography>
                            {c.isVip ? <Chip size="small" color="warning" label="VIP" /> : null}
                          </Stack>
                        </Stack>
                      </TableCell>
                      <TableCell>{c._count.cotas}</TableCell>
                      <TableCell>
                        {(() => {
                          const totalCotas = c._count.cotas;
                          const contempladas = c.contempladasCount ?? 0;
                          if (contempladas <= 0) return <Chip size="small" variant="outlined" label="NÃO" />;
                          if (contempladas >= totalCotas) return <Chip size="small" color="success" label="SIM" />;
                          return <Chip size="small" color="warning" label={`PARCIAL (${contempladas}/${totalCotas})`} />;
                        })()}
                      </TableCell>
                      <TableCell>
                        {c.fotoPath ? "OK" : "Sem foto"} / {c.tirouFoto ? "Tirou" : "Não tirou"}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" gap={1} flexWrap="wrap">
                          {c.possuiParcelasEmAberto ? <Chip size="small" color="error" label="Parcelas" /> : null}
                          {c.possuiContemplacao && !c.tirouFoto ? <Chip size="small" color="error" label="Foto pendente" /> : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          Nenhum cliente encontrado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Box>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ sm: "center" }}
              gap={1}
              sx={{ pt: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Total: {total}
              </Typography>
              <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} />
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast(null)}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: "100%" }}>
          {toast}
        </Alert>
      </Snackbar>
    </Grid>
  );
}
