# Prebills

Lista de Prebills por estado y cliente, y **Nueva Prebill**: elige un cliente con registros
liberados (y su moneda) y qué tiempos, gastos y honorarios fijos entran. Mismo stack y diseño que las
capturas (React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui `new-york`), tema **Coral** (proyecto
Prebills). Abre el detalle en la Slate `universal-aptus-prebilldetail`.

**Fase 1: no escribe en Books.** Crear una Prebill solo la guarda en Aptus (nace en Borrador).

## Backend (función `prebill_services`)

`GET prebills`, `clientes`, `proyectos`, `tiempos|gastos|cargos-fijos?liberado=1&facturado=0`,
`liberado-disponible?cliente_id=&moneda=`; `POST prebills`. Base: `VITE_API_BASE_URL` o la URL de
respaldo en `src/lib/api.ts`. `?nueva=1` abre directo "Nueva Prebill".

`src/lib/prebills.ts` es igual en las dos Slates (copia de `06-prebills/shared/prebills.ts`).

## Comandos

```bash
npm install
npm run dev
npm test
npm run build   # salida: dist
```
