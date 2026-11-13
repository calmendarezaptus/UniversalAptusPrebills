import { useEffect, useMemo, useRef, useState } from 'react'
import 'animate.css'
import { Toaster, toast } from 'sonner'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, FilePlus2, FileText, Info, RefreshCw, Search, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { ThemeMenu } from '@/components/ThemeMenu'
import { cn } from '@/lib/utils'
import { API_BASE, DETAIL_URL, screenUrl } from '@/lib/api'
import { cardCls, gradientBtnCls, inputCls, sectionTitleCls, useTheme } from '@/lib/ui'
import {
  contarIgnorados, crearPrebill, ESTADO_CLS, ESTADO_LABEL, ESTADOS, formatFecha, formatMoney, getListos, getLiberadoDisponible, getPrebills,
  idsPorTipo, KIND_PLURAL, KINDS, lineasDe, listosPorCliente, sumByMoneda,
  type Estado, type Linea, type Listo, type Prebill,
} from '@/lib/prebills'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
type Row = Record<string, any>
const uncertainOf = (error: unknown) => error instanceof Error && 'uncertain' in error && (error as { uncertain?: boolean }).uncertain === true

async function readList(org: string, path: string): Promise<Row[]> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(org)}/${path}`)
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || `No se pudo cargar ${path}.`)
  return data
}

function App() {
  const [theme, setTheme] = useTheme()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })
  const showError = (title: string, error: unknown) => setStatusModal({ isOpen: true, type: 'error', title: uncertainOf(error) ? 'Resultado por verificar' : title, message: error instanceof Error ? error.message : 'Error.' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orgId = params.get('organization_id')
    if (!orgId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else setOrganizationId(orgId)
    if (params.get('nueva') === '1') setCreating(true)
  }, [])

  // ── Prebills ───────────────────────────────────────────────────────────
  const [prebills, setPrebills] = useState<Prebill[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const load = async () => {
    if (!organizationId) return
    setLoading(true); setLoadError('')
    try { setPrebills(await getPrebills(organizationId)) }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las Prebills.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [estado, setEstado] = useState<Estado | 'todas'>('todas')
  const [buscar, setBuscar] = useState('')
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return prebills
      .filter(p => estado === 'todas' || p.status === estado)
      .filter(p => !q || p.cliente_nombre.toLowerCase().includes(q) || String(p.id) === q.replace('#', '') || (p.invoice_number || '').toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id)
  }, [prebills, estado, buscar])
  const conteo = useMemo(() => Object.fromEntries(ESTADOS.map(e => [e, prebills.filter(p => p.status === e).length])) as Record<Estado, number>, [prebills])

  const openDetail = (id: number) => {
    window.location.href = screenUrl(DETAIL_URL, { organization_id: organizationId || '', prebill_id: String(id), origin: window.location.href.split('&nueva=')[0] })
  }

  // ── Nueva Prebill ──────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false)
  const [listos, setListos] = useState<{ rows: Listo[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' })
  const [clientes, setClientes] = useState<Map<string, { nombre: string; moneda?: string }>>(new Map())
  const loadListos = async () => {
    if (!organizationId) return
    setListos(s => ({ ...s, loading: true, error: '' }))
    try {
      const [lineas, proyectos, cats] = await Promise.all([getListos(organizationId), readList(organizationId, 'proyectos'), clientes.size ? Promise.resolve(null) : readList(organizationId, 'clientes')])
      const clientOf = new Map(proyectos.map(p => [Number(p.id), p.cliente_id == null ? null : String(p.cliente_id)]))
      if (cats) setClientes(new Map(cats.map(c => [String(c.id), { nombre: c.nombre, moneda: c.moneda }])))
      setListos({ rows: listosPorCliente(lineas, id => clientOf.get(id) ?? null), loading: false, error: '' })
    } catch (error) { setListos({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudo consultar lo listo para Prebill.' }) }
  }
  useEffect(() => { if (creating) void loadListos() }, [creating, organizationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const nombreCliente = (id: string, fallback = '') => clientes.get(id)?.nombre || prebills.find(p => p.cliente_id === id)?.cliente_nombre || fallback || `Cliente ${id}`
  const listosOrdenados = useMemo(() => [...listos.rows].sort((a, b) => nombreCliente(a.cliente_id).localeCompare(nombreCliente(b.cliente_id), 'es')), [listos.rows, clientes]) // eslint-disable-line react-hooks/exhaustive-deps

  const [elegido, setElegido] = useState<Listo | null>(null)
  const [disponible, setDisponible] = useState<{ rows: Linea[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' })
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  useEffect(() => {
    setDisponible({ rows: [], loading: false, error: '' }); setMarcadas(new Set())
    if (!organizationId || !elegido) return
    const controller = new AbortController()
    setDisponible(s => ({ ...s, loading: true }))
    getLiberadoDisponible(organizationId, elegido.cliente_id, elegido.moneda, controller.signal)
      .then(d => { if (controller.signal.aborted) return; const rows = lineasDe(d); setDisponible({ rows, loading: false, error: '' }); setMarcadas(new Set(rows.map(r => r.key))) })
      .catch(error => { if (!controller.signal.aborted) setDisponible({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar lo disponible.' }) })
    return () => controller.abort()
  }, [organizationId, elegido])
  const seleccion = disponible.rows.filter(r => marcadas.has(r.key))
  const totalSeleccion = sumByMoneda(seleccion)
  const monedaCliente = elegido ? clientes.get(elegido.cliente_id)?.moneda : undefined
  const toggle = (key: string) => setMarcadas(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const toggleKind = (kind: Linea['kind'], on: boolean) => setMarcadas(s => { const n = new Set(s); for (const r of disponible.rows) if (r.kind === kind) { if (on) n.add(r.key); else n.delete(r.key) } return n })

  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const crear = async () => {
    if (busy.current || !organizationId || !elegido || !seleccion.length) return
    busy.current = true; setSaving(true)
    try {
      const creada = await crearPrebill(organizationId, { cliente_id: elegido.cliente_id, moneda: elegido.moneda, ...idsPorTipo(seleccion) })
      const ignorados = contarIgnorados(creada.ids_ignorados)
      if (ignorados) toast.warning(`Prebill #${creada.id} creada. ${ignorados} registro(s) no entraron (ya no estaban disponibles).`)
      else toast.success(`Prebill #${creada.id} creada.`)
      setTimeout(() => openDetail(creada.id), ignorados ? 1800 : 600)
    } catch (error) { showError('No se creó la Prebill', error) }
    finally { busy.current = false; setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#FFF7F7] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 lg:mb-8 gap-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{creating ? 'Nueva Prebill' : 'Prebills'}</h1>
                <ThemeMenu theme={theme} setTheme={setTheme} />
              </div>
              <p className="text-slate-500 text-sm mt-0.5">{creating ? 'Elige un cliente con registros liberados y lo que va en la Prebill' : 'Prebills por cliente y estado; abre una para revisarla y autorizarla'}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            {creating ? (
              <>
                <Button variant="outline" onClick={() => { setCreating(false); setElegido(null) }} className="flex-1 lg:flex-none h-11 sm:h-12 px-6 rounded-lg border-slate-200 text-slate-700 font-medium gap-1.5"><ChevronLeft className="w-4 h-4" />Regresar</Button>
                <Button onClick={() => void crear()} disabled={!elegido || !seleccion.length || saving}
                  className={cn('flex-1 lg:flex-none h-11 sm:h-12 px-6 rounded-lg shadow-sm font-medium gap-2 border-0 disabled:opacity-50', gradientBtnCls)}>
                  <FilePlus2 className="w-4 h-4" />{saving ? 'Creando…' : `Crear Prebill${seleccion.length ? ` (${seleccion.length})` : ''}`}
                </Button>
              </>
            ) : (
              <Button onClick={() => setCreating(true)} className={cn('flex-1 lg:flex-none h-11 sm:h-12 px-6 rounded-lg shadow-sm font-medium gap-2 border-0', gradientBtnCls)}>
                <FilePlus2 className="w-4 h-4" />Nueva Prebill
              </Button>
            )}
          </div>
        </div>

        <div className="relative z-10 space-y-4">
          {!creating ? (
            <div className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap bg-slate-50 p-1 rounded-lg border border-slate-200">
                  {(['todas', ...ESTADOS] as const).map(e => (
                    <button key={e} type="button" onClick={() => setEstado(e)} aria-pressed={estado === e}
                      className={cn('px-3 py-1.5 text-xs font-semibold rounded-md', estado === e ? 'bg-gradient-to-r from-theme-from to-theme-to text-white shadow-sm' : 'text-slate-500 hover:bg-theme-light')}>
                      {e === 'todas' ? `Todas (${prebills.length})` : `${ESTADO_LABEL[e]} (${conteo[e] || 0})`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-64 max-w-full">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Cliente, # o factura..." className={cn(inputCls, 'pl-8')} />
                  </div>
                  <button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar Prebills"
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', loading && 'animate-spin')} />
                  </button>
                </div>
              </div>
              {loadError && <p role="alert" className="text-xs text-red-700 mb-3 rounded-lg border border-red-200 bg-red-50 p-2">{loadError}</p>}
              {loading && !prebills.length ? <p className="text-xs text-slate-500">Cargando Prebills…</p> : !visibles.length ? (
                <p className="text-sm text-slate-500 py-4">No hay Prebills{estado !== 'todas' ? ` en "${ESTADO_LABEL[estado]}"` : ''}{buscar ? ' que coincidan' : ''}.</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="text-left py-2 font-semibold w-14">#</th><th className="text-left py-2 font-semibold">Cliente</th>
                        <th className="text-left py-2 font-semibold">Estado</th><th className="text-right py-2 font-semibold">Honorarios</th>
                        <th className="text-right py-2 font-semibold">Gastos</th><th className="text-right py-2 font-semibold">Total</th>
                        <th className="text-left py-2 font-semibold pl-4">Factura</th><th className="text-left py-2 font-semibold">Actualizada</th><th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visibles.map(p => (
                        <tr key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer hover:bg-theme-light/40">
                          <td className="py-2.5 font-semibold text-slate-700">#{p.id}</td>
                          <td className="py-2.5 text-slate-800 max-w-[280px] truncate" title={p.cliente_nombre}>{p.cliente_nombre}</td>
                          <td className="py-2.5"><span className={cn('text-[11px] font-semibold border rounded px-1.5 py-0.5', ESTADO_CLS[p.status])}>{ESTADO_LABEL[p.status] || p.status}</span></td>
                          <td className="py-2.5 text-right text-slate-600 whitespace-nowrap">{formatMoney(p.totales.honorariosFinal)}</td>
                          <td className="py-2.5 text-right text-slate-600 whitespace-nowrap">{formatMoney(p.totales.subtotalGastos)}</td>
                          <td className="py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">{formatMoney(p.totales.total, p.moneda)}</td>
                          <td className="py-2.5 pl-4 text-slate-500 text-xs">{p.invoice_number || '—'}</td>
                          <td className="py-2.5 text-slate-500 text-xs whitespace-nowrap">{formatFecha(p.actualizado_en || p.creado_en)}</td>
                          <td className="py-2.5 text-right"><ArrowRight className="w-4 h-4 text-slate-400 inline" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Los totales son antes de impuestos. Se factura desde el detalle de cada Prebill, ya autorizada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start" inert={saving}>
              {/* ── Paso 1: cliente ──────────────────────────────────────── */}
              <div className={cn(cardCls, 'min-w-0')}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-theme-from text-white text-[11px] font-bold flex items-center justify-center">1</span><span className={sectionTitleCls}>Cliente y moneda</span></div>
                  <button type="button" onClick={() => void loadListos()} disabled={listos.loading} aria-label="Actualizar clientes"
                    className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', listos.loading && 'animate-spin')} />
                  </button>
                </div>
                {listos.error && <p role="alert" className="text-xs text-red-700 mb-2">{listos.error}</p>}
                {listos.loading && !listos.rows.length ? <p className="text-xs text-slate-500">Buscando lo liberado…</p> : !listosOrdenados.length ? (
                  <p className="text-sm text-slate-500">Ningún cliente tiene registros liberados sin Prebill. Primero libera el periodo en Liberaciones.</p>
                ) : (
                  <ul className="space-y-2">
                    {listosOrdenados.map(l => {
                      const active = elegido?.cliente_id === l.cliente_id && elegido.moneda === l.moneda
                      return (
                        <li key={`${l.cliente_id}|${l.moneda}`}>
                          <button type="button" onClick={() => setElegido(l)} aria-pressed={active}
                            className={cn('w-full text-left rounded-lg border p-3 transition-all', active ? 'border-theme-from bg-theme-light/60 ring-1 ring-theme-from/30' : 'border-slate-200 hover:border-theme-border hover:bg-theme-light/30')}>
                            <p className="text-sm font-medium text-slate-800 truncate">{nombreCliente(l.cliente_id)}</p>
                            <p className="text-[11px] text-slate-500">{l.count} registro(s) · {formatMoney(l.total, l.moneda)}</p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-slate-500">Solo aparecen clientes con algo liberado, facturable y sin Prebill. Una Prebill es de un cliente y una moneda.</p>
              </div>

              {/* ── Paso 2: qué entra ────────────────────────────────────── */}
              <div className={cn(cardCls, 'lg:col-span-2 min-w-0')}>
                <div className="flex items-center gap-2 mb-3"><span className="w-5 h-5 rounded-full bg-theme-from text-white text-[11px] font-bold flex items-center justify-center">2</span><span className={sectionTitleCls}>Qué entra en la Prebill</span></div>
                {!elegido ? <p className="text-sm text-slate-500">Elige un cliente.</p> : disponible.loading ? <p className="text-xs text-slate-500">Cargando lo disponible…</p> : (
                  <>
                    {disponible.error && <p role="alert" className="text-xs text-red-700 mb-2">{disponible.error}</p>}
                    {monedaCliente && monedaCliente !== elegido.moneda && (
                      <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />El cliente está en {monedaCliente} en Books y estos registros en {elegido.moneda}: Aptus no podrá facturar esta Prebill en esta organización.</p>
                    )}
                    {!disponible.rows.length ? <p className="text-sm text-slate-500">Ya no hay nada disponible para este cliente en {elegido.moneda}.</p> : KINDS.map(kind => {
                      const rows = disponible.rows.filter(r => r.kind === kind)
                      if (!rows.length) return null
                      const all = rows.every(r => marcadas.has(r.key))
                      return (
                        <div key={kind} className="mb-4">
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                            <Checkbox checked={all} onCheckedChange={(v: boolean | 'indeterminate') => toggleKind(kind, v === true)} />{KIND_PLURAL[kind]} ({rows.length})
                          </label>
                          <ul className="divide-y divide-slate-50 border border-slate-100 rounded-lg">
                            {rows.map(r => (
                              <li key={r.key}>
                                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                                  <Checkbox checked={marcadas.has(r.key)} onCheckedChange={() => toggle(r.key)} />
                                  <span className="text-xs text-slate-500 w-24 shrink-0">{formatFecha(r.fecha)}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-slate-800 truncate">{r.titulo}{r.horas != null ? ` · ${r.horas} h` : ''}</span>
                                    <span className="block text-[11px] text-slate-500 truncate">{[r.proyecto, r.detalle].filter(Boolean).join(' · ')}</span>
                                  </span>
                                  <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{formatMoney(r.monto)}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                    {!!disponible.rows.length && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <span className="text-xs text-slate-500">{seleccion.length} de {disponible.rows.length} seleccionados</span>
                        <span className="text-sm font-bold text-slate-800">{Object.entries(totalSeleccion).map(([m, v]) => formatMoney(v, m)).join(' · ') || formatMoney(0, elegido.moneda)}</span>
                      </div>
                    )}
                    <p className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />La Prebill nace en Borrador: después puedes agregar o quitar líneas, aplicar descuento, autorizarla y facturarla. Crearla no toca Books.</p>
                  </>
                )}
                {elegido && <button type="button" onClick={() => setElegido(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><X className="w-3 h-3" />Cambiar cliente</button>}
              </div>
            </div>
          )}
        </div>
      </Card>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && !organizationId ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
