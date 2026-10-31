import type { ReactNode } from "react";
import { NominaProvider } from "@/components/nomina/NominaProvider";
export default function NominaLayout({ children }: { children: ReactNode }) {
  return <NominaProvider>{children}</NominaProvider>;
}
