import { TextField, TextFieldProps } from "@mui/material";
import React, { forwardRef } from "react";

export function formatPhoneMask(value: string): string {
  const v = value.replace(/\D/g, "");
  
  if (v.length === 0) return "";
  if (v.length <= 2) return `(${v}`;
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  
  // Format 11 digits: (99) 99999-9999
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
}

export function unmaskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

export function displayPhone(value: string | null | undefined): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return formatPhoneMask(digits);
}

export const PhoneInput = forwardRef<HTMLInputElement, TextFieldProps>((props, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = formatPhoneMask(e.target.value);
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <TextField
      {...props}
      ref={ref}
      onChange={handleChange}
      placeholder="(99) 99999-9999"
    />
  );
});

PhoneInput.displayName = "PhoneInput";
