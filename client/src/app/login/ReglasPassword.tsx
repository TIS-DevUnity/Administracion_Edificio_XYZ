import { REGLAS_PASSWORD } from "@/lib/passwordRules";

interface ReglasPasswordProps {
  strPassword: string;
}

export function ReglasPassword({ strPassword }: ReglasPasswordProps) {
  return (
    <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 rounded-lg border border-border bg-muted/30 p-2 sm:grid-cols-2">
      {REGLAS_PASSWORD.map((regla) => {
        const bolCumple = regla.cumple(strPassword);

        return (
          <li
            key={regla.id}
            className={`flex items-center gap-1 text-[11px] leading-[1.3] transition-colors ${
              bolCumple ? "text-success" : "text-destructive"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0">
              {bolCumple ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              )}
            </svg>
            {regla.label}
          </li>
        );
      })}
    </ul>
  );
}
