interface BotonMostrarPasswordProps {
  bolVisible: boolean;
  onClick: () => void;
}

export function BotonMostrarPassword({ bolVisible, onClick }: BotonMostrarPasswordProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={bolVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
    >
      {bolVisible ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 0 0 1.5 12s3.75 7.5 10.5 7.5c1.61 0 3.09-.343 4.396-.94M6.228 6.228A10.45 10.45 0 0 1 12 4.5c6.75 0 10.5 7.5 10.5 7.5a10.522 10.522 0 0 1-4.293 4.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  );
}
