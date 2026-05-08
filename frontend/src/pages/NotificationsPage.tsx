import { Button, Card, CardActionArea, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications } from "../api/api";
import type { NotificationsResponse } from "../api/types";

function getAlertLink(key: string): string {
  if (key === "cliente_vip") return "/clients?vip=1";
  if (key === "contemplado_sem_foto") return "/clients?contempladoSemFoto=1";
  if (key === "parcelas_em_atraso") return "/clients?atraso=1";
  return "/clients";
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationsResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await getNotifications();
      setData(r);
    })();
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="h5">Alertas</Typography>
      </Grid>

      {(data?.alerts ?? []).map((a) => (
        <Grid key={a.key} item xs={12} md={6}>
          <Card>
            <CardActionArea onClick={() => navigate(getAlertLink(a.key))}>
              <CardContent sx={{ display: "grid", gap: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1}>
                  <Typography variant="h6">{a.title}</Typography>
                  <Chip label={a.count} color={a.count > 0 ? "error" : "default"} />
                </Stack>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {a.clientes.slice(0, 24).map((c) => (
                    <Chip
                      key={c.id}
                      label={
                        a.key === "parcelas_em_atraso"
                          ? `${c.nome} • ${c.cotasEmAtraso ?? 0} cotas • ${c.parcelasEmAtraso ?? 0} parcelas`
                          : c.nome
                      }
                      clickable
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clients/${c.id}`);
                      }}
                    />
                  ))}
                  {a.clientes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Sem pendências.
                    </Typography>
                  ) : null}
                </Stack>
                <Button
                  variant="outlined"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(getAlertLink(a.key));
                  }}
                  sx={{ justifySelf: "start" }}
                >
                  Ver lista
                </Button>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
