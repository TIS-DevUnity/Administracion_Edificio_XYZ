## Descripción del Cambio

<!-- Explica de forma clara y detallada qué problema resuelve este PR o qué funcionalidad añade. -->



## Compromiso del Autor y Lista de Verificación Previa (Checklist)



### 1. Integración y Conflictos

- [ ] **Sin conflictos de merge:** He actualizado mi rama con los últimos cambios de `main` (vía `rebase` o `merge`) y confirmo que no hay conflictos pendientes.

- [ ] **Rama limpia:** Mi rama solo contiene commits relacionados con este ticket. No hay commits de "prueba", "arreglos temporales" o código de otras tareas mezclado.



### 2. Calidad del Código y Limpieza

- [ ] **Sin basura de depuración:** He revisado mi propio diff (cambios) y confirmo que **NO** dejé `console.log`, `print`, `dump`, `TODOs` olvidados o código comentado/muerto.

- [ ] **Sin archivos accidentales ni secretos:** No estoy subiendo archivos de entorno (`.env`), claves/tokens, dependencias locales (`node_modules`, `venv`), ni archivos de editor (`.idea`, `.vscode`, `.DS_Store`).

- [ ] **Formato y linters:** El código cumple con las reglas de estilo y guías de formateo del proyecto (no hay advertencias de linter).



### 3. Pruebas y Estabilidad

- [ ] **Probado localmente:** He levantado el proyecto en local y he verificado el flujo completo de inicio a fin.

- [ ] **Pipelines / CI en verde:** Las pruebas automáticas, compilación y checks de CI pasaron con éxito antes de solicitar revisión.

- [ ] **Impacto colateral:** He verificado que los cambios no rompen otras vistas, servicios o llamadas dependientes.



### 4. Configuración y Base de Datos

- [ ] Si este cambio requiere variables de entorno nuevas, documenté los cambios en `.env.example` y avisé al equipo.

- [ ] Si incluye migraciones o scripts de base de datos, fueron probadas de ida y vuelta (up/down).



---



### Declaración de Responsabilidad

Al abrir este PR, confirmo que he revisado línea por línea mi propio código antes de pedir la revisión de mis compañeros y garantizo que está listo para integrarse.

