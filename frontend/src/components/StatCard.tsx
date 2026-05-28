import { Card, CardContent, Typography, Box, Skeleton } from "@mui/material";
import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  loading?: boolean;
}

export function StatCard({ title, value, loading }: StatCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2, mb: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width="60%" height={40} />
        ) : (
          <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
