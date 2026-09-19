const FILAS = [
  { seccion: "Panel principal", administrador: "Ver", directorio: "Ver", consulta: "Ver" },
  { seccion: "Edificios", administrador: "Ver, crear, editar, eliminar", directorio: "Ver, crear, editar", consulta: "Ver" },
  { seccion: "Inmuebles", administrador: "Ver, crear, editar, eliminar", directorio: "Ver, crear, editar", consulta: "Ver" },
  { seccion: "Residentes", administrador: "Ver, crear, editar, eliminar", directorio: "Ver, crear, editar", consulta: "Ver" },
  { seccion: "Pagos", administrador: "Ver, crear, editar, eliminar", directorio: "Ver, crear, editar", consulta: "Ver" },
  { seccion: "Mantenimiento", administrador: "Ver, crear, editar, eliminar", directorio: "Ver, crear, editar", consulta: "Ver" },
  { seccion: "Usuarios", administrador: "Ver, crear, editar, eliminar", directorio: "Ver", consulta: "Sin acceso" },
  { seccion: "Configurar roles", administrador: "Ver, editar", directorio: "Sin acceso", consulta: "Sin acceso" },
];


export default function ConfigurarRolesPage() {
  return (
    <div className="px-6 py-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Matriz de permisos por rol aplicada actualmente en el sistema. Todavía no existe un módulo de
        backend para editar roles y permisos de forma dinámica, así que esta tabla es de referencia.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Sección
              </th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Administrador
              </th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Directorio
              </th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Consulta
              </th>
            </tr>
          </thead>

          <tbody>
            {FILAS.map((fila) => (
              <tr key={fila.seccion} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                <td className="font-subtitle px-5 py-3 text-[13px] font-semibold leading-[1.45] text-foreground">
                  {fila.seccion}
                </td>
                <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">{fila.administrador}</td>
                <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">{fila.directorio}</td>
                <td className="px-5 py-3 text-[13px] leading-[1.45] text-muted-foreground">{fila.consulta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
