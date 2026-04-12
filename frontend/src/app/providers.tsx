"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { SWRConfig } from "swr";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <SWRConfig 
      value={{ 
        dedupingInterval: 60000, // 60 seconds
        revalidateOnFocus: false // Less aggressive refetching when switching tabs
      }}
    >
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </SWRConfig>
  );
}
