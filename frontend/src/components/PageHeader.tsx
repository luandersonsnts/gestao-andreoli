import { Box, Typography, Stack, TypographyProps } from "@mui/material";
import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  titleProps?: TypographyProps;
}

export function PageHeader({ title, subtitle, action, titleProps }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", sm: "center" }}
      gap={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography variant="h4" component="h1" {...titleProps}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
          {action}
        </Box>
      )}
    </Stack>
  );
}
