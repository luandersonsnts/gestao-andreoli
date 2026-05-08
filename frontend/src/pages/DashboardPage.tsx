import { Card, CardContent, Grid, Typography, useTheme } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getDashboardSummary } from "../api/api";
import type { DashboardSummary } from "../api/types";

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5">{value}</Typography>
      </CardContent>
    </Card>
  );
}

function normalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function administradoraColor(name: string, colors: { gazin: string; tradicao: string; other: string }) {
  const n = normalizeName(name);
  if (n.includes("gazin")) return colors.gazin;
  if (n.includes("tradicao") || n.includes("tradi")) return colors.tradicao;
  return colors.other;
}

export function DashboardPage() {
  const theme = useTheme();
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await getDashboardSummary();
      setData(r);
    })();
  }, []);

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.charts.contempladosVsNao.labels.map((label, i) => ({
      name: label,
      value: data.charts.contempladosVsNao.values[i] ?? 0
    }));
  }, [data]);

  const monthlyData = useMemo(() => {
    if (!data) return [];
    return data.charts.entradasMensais.labels.map((mes, i) => ({
      mes,
      total: data.charts.entradasMensais.values[i] ?? 0
    }));
  }, [data]);

  const adminsData = useMemo(() => {
    if (!data) return [];
    return data.charts.administradoras.labels.map((administradora, i) => ({
      administradora,
      total: data.charts.administradoras.values[i] ?? 0
    }));
  }, [data]);

  const cotasData = useMemo(() => {
    if (!data) return [];
    return data.charts.clientesPorCotas.labels.map((faixa, i) => ({
      faixa,
      total: data.charts.clientesPorCotas.values[i] ?? 0
    }));
  }, [data]);

  const colors = {
    primary: theme.palette.primary.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    text: theme.palette.text.secondary,
    grid: theme.palette.divider
  };

  const adminColors = {
    gazin: "#0d47a1",
    tradicao: colors.success,
    other: colors.primary
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="h5">Dashboard</Typography>
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Total de clientes" value={String(data?.totals.totalClientes ?? "-")} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Clientes contemplados" value={String(data?.totals.totalContemplados ?? "-")} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Clientes VIP (>2 cotas)" value={String(data?.totals.totalVip ?? "-")} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Taxa de conversão"
          value={data ? `${Math.round(data.totals.taxaConversao * 100)}%` : "-"}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent sx={{ height: 320 }}>
            <Typography variant="subtitle1">Contemplados vs não contemplados</Typography>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={4}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? colors.success : colors.warning} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent sx={{ height: 320 }}>
            <Typography variant="subtitle1">Evolução mensal de entradas</Typography>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="entradasFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
                <XAxis dataKey="mes" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={colors.primary}
                  fill="url(#entradasFill)"
                  strokeWidth={2}
                  name="Entradas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent sx={{ height: 320 }}>
            <Typography variant="subtitle1">Administradoras mais utilizadas</Typography>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adminsData} layout="vertical" margin={{ top: 16, right: 12, bottom: 0, left: 24 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="administradora" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Cotas" radius={[8, 8, 8, 8]}>
                  {adminsData.map((row) => (
                    <Cell
                      key={row.administradora}
                      fill={administradoraColor(row.administradora, adminColors)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent sx={{ height: 320 }}>
            <Typography variant="subtitle1">Clientes por quantidade de cotas</Typography>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cotasData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
                <XAxis dataKey="faixa" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill={colors.warning} name="Clientes" radius={[8, 8, 8, 8]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
