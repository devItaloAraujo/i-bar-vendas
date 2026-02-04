import { useState, useEffect, useRef } from 'react'
import { MdAdd, MdClose, MdReceipt, MdTableRestaurant, MdHistory, MdSettings, MdSearch, MdRestaurantMenu, MdEdit, MdPictureAsPdf, MdFlashOn } from 'react-icons/md'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  getMenu,
  getTables,
  getHistory,
  getCategoriesWithItems,
  addTable as dbAddTable,
  updateTable as dbUpdateTable,
  addTableOrder,
  updateTableOrder,
  deleteTableOrder,
  closeTableAndAddToHistory,
  addHistoryEntry,
  addCategory as dbAddCategory,
  addMenuItem as dbAddMenuItem,
  updateMenuItem as dbUpdateMenuItem,
  deleteMenuItem as dbDeleteMenuItem,
  getCategoryItemCount,
  deleteCategory as dbDeleteCategory,
  type Table,
  type Order,
  type HistoryEntry,
  type MenuCategory,
  type CategoryWithItems,
  type MenuItemRow,
} from './db'

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function getBeverageVolumePrefix(category: string): string {
  if (category === 'Cervejas 600mL') return '600mL '
  if (category === 'Refrigerantes 2L') return '2L '
  return ''
}

const CATEGORIES_WITH_VOLUME_FORMAT = ['Cervejas 600mL', 'Litrinho', 'Long Neck', 'Refrigerantes 2L']

function formatOrderDescription(itemName: string, category: string): string {
  if (CATEGORIES_WITH_VOLUME_FORMAT.includes(category)) return `${itemName} - ${category}`
  return itemName
}

function normalizeForSearch(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parsePrice(value: string): number {
  const n = parseFloat(value.trim().replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type TabId = 'mesas' | 'venda-rapida' | 'historico' | 'produtos'
type RelatorioPeriodo = '24h' | '48h' | 'semana' | 'mes_atual' | 'mes_anterior'

export default function App() {
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [dbReady, setDbReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('mesas')
  const [addOpen, setAddOpen] = useState(false)
  const [newTableOpen, setNewTableOpen] = useState(false)
  const [saleTableId, setSaleTableId] = useState<string>('')
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number | null>(null)
  const [addOrderSearchQuery, setAddOrderSearchQuery] = useState('')
  const [customProductModalOpen, setCustomProductModalOpen] = useState(false)
  const [customProductName, setCustomProductName] = useState('')
  const [customProductPrice, setCustomProductPrice] = useState('')
  const [pendingProductChoice, setPendingProductChoice] = useState<{
    productName: string
    categoryName: string
    quantity: number
    price?: number
    priceDrink?: number
    priceTakeaway?: number
  } | null>(null)
  const [newTableName, setNewTableName] = useState('')
  const [editOrderModal, setEditOrderModal] = useState<{ tableId: string; order: Order } | null>(null)
  const [editOrderDescription, setEditOrderDescription] = useState('')
  const [editOrderQuantity, setEditOrderQuantity] = useState(1)
  const [editOrderUnitPrice, setEditOrderUnitPrice] = useState('')
  const [removeConfirm, setRemoveConfirm] = useState<{
    tableId: string
    orderId: string
    description: string
  } | null>(null)
  const [closeAccountModal, setCloseAccountModal] = useState<Table | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const [closeAccountExiting, setCloseAccountExiting] = useState(false)
  const [totalJustUpdated, setTotalJustUpdated] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; exiting?: boolean; type?: 'success' | 'remove' }>>([])
  const [showWelcome, setShowWelcome] = useState(true)
  const [welcomeExiting, setWelcomeExiting] = useState(false)
  const [historicoPaymentFilter, setHistoricoPaymentFilter] = useState<string | null>(null)
  const [quickSaleTotal, setQuickSaleTotal] = useState('')
  const [quickSalePaymentMethod, setQuickSalePaymentMethod] = useState<string | null>(null)
  const [quickSaleExiting, setQuickSaleExiting] = useState(false)
  const [relatorioModalOpen, setRelatorioModalOpen] = useState(false)
  const [relatorioTipo, setRelatorioTipo] = useState<'completo' | 'credito' | 'anotado' | null>('completo')
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<RelatorioPeriodo>('24h')
  const [categoriesWithItems, setCategoriesWithItems] = useState<CategoryWithItems[]>([])
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [newProductCategoryId, setNewProductCategoryId] = useState<string>('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductPriceDrink, setNewProductPriceDrink] = useState('')
  const [newProductPriceTakeaway, setNewProductPriceTakeaway] = useState('')
  const [newProductPriceMode, setNewProductPriceMode] = useState<'single' | 'beberLevar'>('single')
  const [editProductModal, setEditProductModal] = useState<{ item: MenuItemRow; categoryId: string } | null>(null)
  const [removeProductConfirm, setRemoveProductConfirm] = useState<{
    itemName: string
    itemId: string
    categoryId: string
  } | null>(null)
  const [editProductName, setEditProductName] = useState('')
  const [editProductPrice, setEditProductPrice] = useState('')
  const [editProductPriceDrink, setEditProductPriceDrink] = useState('')
  const [editProductPriceTakeaway, setEditProductPriceTakeaway] = useState('')
  const [editProductPriceMode, setEditProductPriceMode] = useState<'single' | 'beberLevar'>('single')
  const newTableInputRef = useRef<HTMLInputElement>(null)
  const editingTableNameInputRef = useRef<HTMLInputElement>(null)
  const novoClientePlaceholderRef = useRef<HTMLButtonElement>(null)
  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [editingTableName, setEditingTableName] = useState('')
  const toastHideTimersRef = useRef<Record<string, number>>({})
  const toastRemoveScheduledRef = useRef<Set<string>>(new Set())
  const pendingCloseAccountRef = useRef<{ tableId: string; paymentMethod: string; clientName: string } | null>(null)
  const pendingQuickSaleRef = useRef<{ total: number; paymentMethod: string } | null>(null)

  const today = todayISO()
  const dailyTotal = history
    .filter((entry) => entry.paidAt.slice(0, 10) === today)
    .reduce(
      (sum, entry) => sum + entry.orders.reduce((s, o) => s + o.amount, 0),
      0
    )

  /** Parses order description: if it ends with " x N", returns base name and N; otherwise description and quantity from order. */
  function parseOrderForEdit(description: string, quantityFromOrder?: number): { baseDescription: string; quantity: number } {
    const match = description.trim().match(/^(.*)\s+x\s*(\d+)$/i)
    if (match) {
      return { baseDescription: match[1].trim(), quantity: parseInt(match[2], 10) || 1 }
    }
    return { baseDescription: description.trim(), quantity: quantityFromOrder ?? 1 }
  }

  /** Display label for an order: "Product name" or "Product name xN" (N from quantity, never baked into name). */
  function orderDisplayLabel(order: Order): string {
    const { baseDescription, quantity } = parseOrderForEdit(order.description, order.quantity)
    return quantity > 1 ? `${baseDescription} x${quantity}` : baseDescription
  }

  function addOrderFromProduct(description: string, amount: number, quantity: number = 1) {
    if (!saleTableId || amount <= 0) return
    addTableOrder(saleTableId, { description, amount, date: today, quantity }).then((order) => {
      setTables((prev) =>
        prev.map((t) =>
          t.id === saleTableId ? { ...t, orders: [...t.orders, order] } : t
        )
      )
      setPendingProductChoice(null)
      const label = quantity > 1 ? `${description} x${quantity}` : description
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${label} adicionado à mesa`, type: 'success' }])
    })
  }

  // Load menu, tables, history, categories from IndexedDB on mount
  useEffect(() => {
    let cancelled = false
    Promise.all([getMenu(), getTables(), getHistory(), getCategoriesWithItems()]).then(
      ([menuData, tablesData, historyData, categoriesData]) => {
        if (cancelled) return
        setMenu(menuData)
        setTables(tablesData)
        setHistory(historyData)
        setCategoriesWithItems(categoriesData)
        setDbReady(true)
      }
    )
    return () => { cancelled = true }
  }, [])

  async function refreshProductsAndMenu() {
    const [menuData, categoriesData] = await Promise.all([getMenu(), getCategoriesWithItems()])
    setMenu(menuData)
    setCategoriesWithItems(categoriesData)
  }

  useEffect(() => {
    toasts.forEach((t) => {
      if (t.exiting) return
      if (toastHideTimersRef.current[t.id] != null) return
      const id = t.id
      const timerId = window.setTimeout(() => {
        setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)))
        delete toastHideTimersRef.current[id]
      }, 1500)
      toastHideTimersRef.current[t.id] = timerId
    })
  }, [toasts])

  useEffect(() => {
    return () => {
      Object.values(toastHideTimersRef.current).forEach(clearTimeout)
      toastHideTimersRef.current = {}
    }
  }, [])

  useEffect(() => {
    toasts.forEach((t) => {
      if (!t.exiting) return
      if (toastRemoveScheduledRef.current.has(t.id)) return
      toastRemoveScheduledRef.current.add(t.id)
      const id = t.id
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
        toastRemoveScheduledRef.current.delete(id)
      }, 300)
    })
  }, [toasts])

  function openAddModal() {
    setSelectedCategoryIndex(0)
    setAddOrderSearchQuery('')
    setCustomProductModalOpen(false)
    setPendingProductChoice(null)
    setAddOpen(true)
  }

  function openCustomProductModal() {
    setAddOrderSearchQuery('')
    setSelectedCategoryIndex(null)
    setCustomProductName('')
    setCustomProductPrice('')
    setCustomProductModalOpen(true)
  }

  function openEditOrderModal(tableId: string, order: Order) {
    setEditOrderModal({ tableId, order })
    const { baseDescription, quantity } = parseOrderForEdit(order.description, order.quantity)
    setEditOrderDescription(baseDescription)
    setEditOrderQuantity(quantity)
    const unit = quantity > 0 ? order.amount / quantity : order.amount
    setEditOrderUnitPrice(unit === 0 ? '' : unit.toFixed(2).replace('.', ','))
  }

  function removeOrder(tableId: string, orderId: string) {
    deleteTableOrder(tableId, orderId).then(() => {
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, orders: t.orders.filter((o) => o.id !== orderId) } : t
        )
      )
      setEditOrderModal(null)
    })
  }

  function updateOrder(
    tableId: string,
    orderId: string,
    description: string,
    quantity: number,
    unitPrice: number
  ) {
    if (quantity < 1 || unitPrice <= 0) return
    const amount = Math.round(unitPrice * quantity * 100) / 100
    const displayLabel = quantity > 1 ? `${description.trim()} x${quantity}` : description.trim()
    updateTableOrder(tableId, orderId, {
      description: description.trim(),
      amount,
      quantity,
    }).then(() => {
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  o.id === orderId
                    ? { ...o, description: description.trim(), amount, quantity }
                    : o
                ),
              }
            : t
        )
      )
      setEditOrderModal(null)
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${displayLabel} atualizado`, type: 'success' }])
    })
  }

  function incrementOrderQuantity(tableId: string, order: Order) {
    const { baseDescription, quantity } = parseOrderForEdit(order.description, order.quantity)
    const newQty = quantity + 1
    const unitPrice = quantity > 0 ? order.amount / quantity : order.amount
    const newAmount = Math.round(unitPrice * newQty * 100) / 100
    updateTableOrder(tableId, order.id, {
      description: baseDescription,
      amount: newAmount,
      quantity: newQty,
    }).then(() => {
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  o.id === order.id
                    ? { ...o, description: baseDescription, amount: newAmount, quantity: newQty }
                    : o
                ),
              }
            : t
        )
      )
      const label = newQty > 1 ? `${baseDescription} x${newQty}` : baseDescription
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${label} — quantidade atualizada`, type: 'success' }])
    })
  }

  function closeEditOrderModal() {
    setEditOrderModal(null)
  }

  function addTable() {
    const name = newTableName.trim().slice(0, 15)
    if (!name) return
    dbAddTable(name).then((newTable) => {
      setTables((prev) => [...prev, newTable])
      setSaleTableId(newTable.id)
      setNewTableName('')
      setNewTableOpen(false)
      openAddModal()
    })
  }

  const PAYMENT_METHODS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Voucher', 'Anotado na conta'] as const

  function closeTableWithPayment(tableId: string, paymentMethod: string) {
    const table = tables.find((t) => t.id === tableId)
    if (!table || table.orders.length === 0) return
    closeTableAndAddToHistory(tableId, table, paymentMethod).then((newEntry) => {
      setHistory((prev) => [newEntry, ...prev])
      setTables((prev) => prev.filter((t) => t.id !== tableId))
      setCloseAccountModal(null)
      setSelectedPaymentMethod(null)
    })
  }

  function submitQuickSale() {
    const total = Math.round(parsePrice(quickSaleTotal) * 100) / 100
    if (total <= 0 || quickSalePaymentMethod == null) return
    pendingQuickSaleRef.current = { total, paymentMethod: quickSalePaymentMethod }
    setQuickSaleExiting(true)
  }

  const tableTotal = (t: Table) => t.orders.reduce((s, o) => s + o.amount, 0)
  const historyEntryTotal = (e: HistoryEntry) => e.orders.reduce((s, o) => s + o.amount, 0)

  function filterHistoryByPeriod(entries: HistoryEntry[], period: RelatorioPeriodo): HistoryEntry[] {
    const now = Date.now()
    const cut24 = now - 24 * 60 * 60 * 1000
    const cut48 = now - 48 * 60 * 60 * 1000
    const cutSemana = now - 7 * 24 * 60 * 60 * 1000
    const today = new Date()
    const firstDayMesAtual = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
    const lastDayMesAtual = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
    const firstDayMesAnterior = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime()
    const lastDayMesAnterior = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).getTime()
    return entries.filter((e) => {
      const t = new Date(e.paidAt).getTime()
      switch (period) {
        case '24h': return t >= cut24
        case '48h': return t >= cut48
        case 'semana': return t >= cutSemana
        case 'mes_atual': return t >= firstDayMesAtual && t <= lastDayMesAtual
        case 'mes_anterior': return t >= firstDayMesAnterior && t <= lastDayMesAnterior
        default: return true
      }
    })
  }

  function generateRelatorioPdf(tipo: 'completo' | 'credito' | 'anotado', period: RelatorioPeriodo) {
    const byTipo =
      tipo === 'credito'
        ? history.filter((e) => (e.paymentMethod ?? '') === 'Crédito')
        : tipo === 'anotado'
          ? history.filter((e) => (e.paymentMethod ?? '') === 'Anotado na conta')
          : [...history]
    const filtered = filterHistoryByPeriod(byTipo, period)
    const reversed = [...filtered].reverse()

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = 18

    const periodLabels: Record<RelatorioPeriodo, string> = {
      '24h': 'Últimas 24 horas',
      '48h': 'Últimas 48 horas',
      semana: 'Última semana',
      mes_atual: 'Mês corrente',
      mes_anterior: 'Último mês',
    }
    const title =
      tipo === 'completo'
        ? 'Relatório completo de vendas'
        : tipo === 'credito'
          ? 'Relatório — vendas no crédito'
          : 'Relatório — vendas anotadas na conta'
    doc.setFontSize(16)
    doc.text(title, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Período: ${periodLabels[period]}`, 14, y)
    y += 6
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, y)
    y += 8

    if (tipo === 'completo' && reversed.length > 0) {
      const totalGeral = reversed.reduce((s, e) => s + historyEntryTotal(e), 0)
      doc.setFontSize(11)
      doc.text(`Vendas totais: ${formatMoney(totalGeral)}`, 14, y)
      y += 7
      const byMethod = PAYMENT_METHODS.map((method) => ({
        method,
        total: filtered
          .filter((e) => (e.paymentMethod ?? '') === method)
          .reduce((s, e) => s + historyEntryTotal(e), 0),
      })).filter((x) => x.total > 0)
      byMethod.forEach(({ method, total }) => {
        doc.setFontSize(10)
        doc.text(`${method}: ${formatMoney(total)}`, 14, y)
        y += 6
      })
      y += 4
    } else if (reversed.length > 0) {
      const totalFiltrado = reversed.reduce((s, e) => s + historyEntryTotal(e), 0)
      doc.setFontSize(11)
      doc.text(`Total: ${formatMoney(totalFiltrado)}`, 14, y)
      y += 10
    }

    const tableData = reversed.map((entry) => [
      formatDate(entry.paidAt),
      entry.clientName,
      formatMoney(historyEntryTotal(entry)),
      entry.paymentMethod ?? '—',
    ])

    autoTable(doc, {
      startY: y,
      head: [['Data/Horário', 'Cliente', 'Valor', 'Método de pagamento']],
      body: tableData,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [255, 255, 255], textColor: [50, 50, 50], fontStyle: 'bold' },
    })

    doc.autoPrint()
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const printWin = window.open(url, '_blank', 'noopener,noreferrer')
    if (printWin) {
      printWin.focus()
      const tryPrint = () => {
        try {
          printWin.print()
        } catch {
          // ignore
        }
      }
      const t = setTimeout(tryPrint, 800)
      printWin.addEventListener('load', () => {
        clearTimeout(t)
        tryPrint()
      }, { once: true })
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } else {
      doc.save(`relatorio-vendas-${tipo}-${new Date().toISOString().slice(0, 10)}.pdf`)
      URL.revokeObjectURL(url)
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Popup bloqueado — PDF guardado. Abra o ficheiro e use Ctrl+P para imprimir.', type: 'success' }])
    }
    setRelatorioModalOpen(false)
    setRelatorioTipo(null)
    setRelatorioPeriodo('24h')
    if (printWin) {
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Impressão aberta — imprima ou guarde como PDF', type: 'success' }])
    }
  }

  function dismissWelcome() {
    const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    if ((isDesktop || isStandalone) && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may fail (e.g. not allowed by browser); continue anyway
      })
    }
    setWelcomeExiting(true)
  }

  useEffect(() => {
    if (!showWelcome || welcomeExiting) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        dismissWelcome()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [showWelcome, welcomeExiting])

  useEffect(() => {
    if (showWelcome || activeTab !== 'mesas') return
    const id = setTimeout(() => {
      novoClientePlaceholderRef.current?.focus()
    }, 500)
    return () => clearTimeout(id)
  }, [showWelcome, activeTab])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (relatorioModalOpen) {
        e.preventDefault()
        setRelatorioModalOpen(false)
        setRelatorioTipo(null)
        setRelatorioPeriodo('24h')
      } else if (closeAccountModal) {
        e.preventDefault()
        setCloseAccountModal(null)
      } else if (removeConfirm) {
        e.preventDefault()
        setRemoveConfirm(null)
      } else if (removeProductConfirm) {
        e.preventDefault()
        setRemoveProductConfirm(null)
      } else if (editOrderModal) {
        e.preventDefault()
        closeEditOrderModal()
      } else if (editProductModal) {
        e.preventDefault()
        setEditProductModal(null)
      } else if (newCategoryOpen) {
        e.preventDefault()
        setNewCategoryOpen(false)
      } else if (newProductOpen) {
        e.preventDefault()
        setNewProductOpen(false)
      } else if (addOpen) {
        e.preventDefault()
        setAddOpen(false)
      } else if (newTableOpen) {
        e.preventDefault()
        setNewTableOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [addOpen, newTableOpen, editOrderModal, removeConfirm, removeProductConfirm, closeAccountModal, editProductModal, newCategoryOpen, newProductOpen])

  useEffect(() => {
    const anyModalOpen =
      addOpen ||
      newTableOpen ||
      !!editOrderModal ||
      !!removeConfirm ||
      !!removeProductConfirm ||
      !!closeAccountModal ||
      relatorioModalOpen ||
      newCategoryOpen ||
      newProductOpen ||
      !!editProductModal
    if (!anyModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [addOpen, newTableOpen, editOrderModal, removeConfirm, removeProductConfirm, closeAccountModal, relatorioModalOpen, newCategoryOpen, newProductOpen, editProductModal])

  useEffect(() => {
    if (!newTableOpen) return
    const id = setTimeout(() => {
      newTableInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(id)
  }, [newTableOpen])

  useEffect(() => {
    if (!editingTableId) return
    setEditingTableName(tables.find((t) => t.id === editingTableId)?.name ?? '')
    const id = setTimeout(() => {
      editingTableNameInputRef.current?.focus()
      editingTableNameInputRef.current?.select()
    }, 0)
    return () => clearTimeout(id)
  }, [editingTableId, tables])

  function saveEditingTableName(tableId: string, currentName: string) {
    const nextName = editingTableName.trim() || currentName
    if (nextName === currentName) {
      setEditingTableId(null)
      return
    }
    dbUpdateTable(tableId, { name: nextName }).then(() => {
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, name: nextName } : t))
      )
      setEditingTableId(null)
    })
  }

  function handleWelcomeTransitionEnd(e: React.TransitionEvent) {
    if (e.propertyName !== 'opacity') return
    if (welcomeExiting) {
      setShowWelcome(false)
      setWelcomeExiting(false)
    }
  }

  // Keep saleTableId in sync when tables exist but selection is empty or invalid
  useEffect(() => {
    if (tables.length === 0) return
    const valid = tables.some((t) => t.id === saleTableId)
    if (!valid) setSaleTableId(tables[0].id)
  }, [tables, saleTableId])

  useEffect(() => {
    if (!closeAccountExiting) return
    const id = window.setTimeout(() => {
      const p = pendingCloseAccountRef.current
      if (p) {
        closeTableWithPayment(p.tableId, p.paymentMethod)
        setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${p.clientName} — Venda registrada!`, type: 'success' }])
        setTotalJustUpdated(true)
        pendingCloseAccountRef.current = null
      }
      setCloseAccountModal(null)
      setSelectedPaymentMethod(null)
      setCloseAccountExiting(false)
    }, 320)
    return () => clearTimeout(id)
  }, [closeAccountExiting])

  useEffect(() => {
    if (!quickSaleExiting) return
    const id = window.setTimeout(() => {
      const p = pendingQuickSaleRef.current
      if (p) {
        const order: Order = {
          id: crypto.randomUUID(),
          description: 'Venda rápida',
          amount: p.total,
          date: todayISO(),
          quantity: 1,
        }
        addHistoryEntry({
          clientName: 'venda rapida',
          paidAt: new Date().toISOString(),
          paymentMethod: p.paymentMethod,
          orders: [order],
        }).then((newEntry) => {
          setHistory((prev) => [newEntry, ...prev])
          setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Venda rápida registrada!', type: 'success' }])
        })
        setQuickSaleTotal('')
        setQuickSalePaymentMethod(null)
        pendingQuickSaleRef.current = null
      }
      setQuickSaleExiting(false)
    }, 320)
    return () => clearTimeout(id)
  }, [quickSaleExiting])

  useEffect(() => {
    if (!totalJustUpdated) return
    const id = window.setTimeout(() => setTotalJustUpdated(false), 1500)
    return () => clearTimeout(id)
  }, [totalJustUpdated])

  if (!dbReady) {
    return (
      <div className="app app--ready">
        <div className="app-bg" aria-hidden>
          <div className="app-bg-shape app-bg-shape-1" />
          <div className="app-bg-shape app-bg-shape-2" />
          <div className="app-bg-shape app-bg-shape-3" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--color-text, #1a1a1a)' }}>
          Carregando…
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${!showWelcome ? 'app--ready' : ''}`}>
      {(showWelcome || welcomeExiting) && (
        <div
          className={`welcome-overlay ${welcomeExiting ? 'welcome-overlay--exited' : ''}`}
          onTransitionEnd={handleWelcomeTransitionEnd}
          aria-hidden={welcomeExiting}
        >
          <div className="welcome-backdrop" aria-hidden />
          <div className="welcome-modal">
            <h1 className="welcome-title">iBar-vendas</h1>
            <p className="welcome-desc">Bem Vindo</p>
            <button
              type="button"
              className="welcome-cta"
              onClick={dismissWelcome}
              aria-label="Abrir iBar-vendas"
            >
              Iniciar
            </button>
          </div>
        </div>
      )}

      <div className="app-bg" aria-hidden>
        <div className="app-bg-shape app-bg-shape-1" />
        <div className="app-bg-shape app-bg-shape-2" />
        <div className="app-bg-shape app-bg-shape-3" />
      </div>

      <header className="header">
        <div className="header-inner">
          <Logo />
          <div className="header-right">
            <div className="tabs" role="tablist" aria-label="Abas">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'mesas'}
                aria-controls="panel-mesas"
                id="tab-mesas"
                className={`tab ${activeTab === 'mesas' ? 'tab--active' : ''}`}
                onClick={() => setActiveTab('mesas')}
              >
                <MdTableRestaurant size={20} aria-hidden />
                Mesas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'venda-rapida'}
                aria-controls="panel-venda-rapida"
                id="tab-venda-rapida"
                className={`tab ${activeTab === 'venda-rapida' ? 'tab--active' : ''}`}
                onClick={() => setActiveTab('venda-rapida')}
              >
                <MdFlashOn size={20} aria-hidden />
                Venda Rápida
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'historico'}
                aria-controls="panel-historico"
                id="tab-historico"
                className={`tab ${activeTab === 'historico' ? 'tab--active' : ''}`}
                onClick={() => setActiveTab('historico')}
              >
                <MdHistory size={20} aria-hidden />
                Histórico
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'produtos'}
                aria-controls="panel-produtos"
                id="tab-produtos"
                className={`tab ${activeTab === 'produtos' ? 'tab--active' : ''}`}
                onClick={() => setActiveTab('produtos')}
              >
                <MdRestaurantMenu size={20} aria-hidden />
                Produtos
              </button>
            </div>
            <div className={`daily-total ${totalJustUpdated ? 'daily-total--glow' : ''}`} title="Vendas de hoje">
              <span className="daily-total-label">Total PAGO HOJE</span>
              <span className="daily-total-value">{formatMoney(dailyTotal)}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        <p className="hero-tagline">
          {activeTab === 'mesas'
            ? 'Controle de mesas e vendas do dia. Acompanhe pedidos e faturamento em um só lugar.'
            : activeTab === 'venda-rapida'
              ? 'Registre vendas avulsas. Informe o valor total e o método de pagamento.'
              : activeTab === 'historico'
                ? 'Histórico de vendas por cliente. Pedidos já pagos e consolidados.'
                : 'Edite o catálogo de produtos. Adicione categorias e itens ou altere preços.'}
        </p>

        {activeTab === 'mesas' && (
          <section className="workspace" id="panel-mesas" role="tabpanel" aria-labelledby="tab-mesas">
            <div className="workspace-grid">
              {tables.map((table) => (
                <article key={table.id} className="table-card">
                  <div
                    className="table-card-header"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={() => setEditingTableId(table.id)}
                  >
                    <div className="table-card-header-left">
                      <MdTableRestaurant size={20} className="table-card-header-icon" aria-hidden />
                      {editingTableId === table.id ? (
                        <input
                          ref={editingTableId === table.id ? editingTableNameInputRef : null}
                          type="text"
                          className="table-card-title table-card-title--client table-card-title-input"
                          value={editingTableName}
                          onChange={(e) => setEditingTableName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEditingTableName(table.id, table.name)
                            }
                            if (e.key === 'Escape') {
                              setEditingTableName(table.name)
                              setEditingTableId(null)
                            }
                          }}
                          onBlur={() => saveEditingTableName(table.id, table.name)}
                          aria-label="Nome do cliente"
                        />
                      ) : (
                        <h2 className="table-card-title table-card-title--client">{table.name}</h2>
                      )}
                    </div>
                    <span className="table-card-total">{formatMoney(tableTotal(table))}</span>
                  </div>
                  <div
                    className="table-card-body"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSaleTableId(table.id)
                      openAddModal()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSaleTableId(table.id)
                        openAddModal()
                      }
                    }}
                    aria-label={`${table.name} — anotar pedido`}
                  >
                    {table.orders.length === 0 ? (
                      <p className="table-card-empty">Clique para anotar o primeiro pedido</p>
                    ) : (
                      <ul className="table-orders">
                        {table.orders.map((order) => (
                          <li key={order.id} className="table-order">
                            <span className="table-order-desc">
                              {(() => {
                                const { baseDescription, quantity } = parseOrderForEdit(order.description, order.quantity)
                                return (
                                  <>
                                    {baseDescription}
                                    {quantity > 1 && <span className="table-order-qty"> x{quantity}</span>}
                                  </>
                                )
                              })()}
                            </span>
                            <span className="table-order-right">
                              <span className="table-order-amount">{formatMoney(order.amount)}</span>
                              <button
                                type="button"
                                className="table-order-plus"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  incrementOrderQuantity(table.id, order)
                                }}
                                aria-label={`Adicionar 1 unidade: ${orderDisplayLabel(order)}`}
                              >
                                <MdAdd size={18} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="table-order-gear"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditOrderModal(table.id, order)
                                }}
                                aria-label={`Editar ou remover: ${orderDisplayLabel(order)}`}
                              >
                                <MdSettings size={16} aria-hidden />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="table-card-footer">
                    {table.orders.length > 0 && (
                      <button
                        type="button"
                        className="table-card-close-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCloseAccountModal(table)
                          setSelectedPaymentMethod(null)
                        }}
                        aria-label={`Fechar a conta — ${table.name}`}
                      >
                        Fechar a conta
                      </button>
                    )}
                  </div>
                </article>
              ))}
              <button
              ref={novoClientePlaceholderRef}
              type="button"
              className="table-card table-card-placeholder"
              onClick={() => setNewTableOpen(true)}
              aria-label="Novo cliente — informar nome do cliente"
            >
<span className="table-card-placeholder-label">Novo cliente</span>
            </button>
            </div>
          </section>
        )}

        {activeTab === 'venda-rapida' && (
          <section className="venda-rapida-workspace" id="panel-venda-rapida" role="tabpanel" aria-labelledby="tab-venda-rapida">
            <div className={`venda-rapida-card ${quickSaleExiting ? 'venda-rapida-card--exiting' : ''}`}>
              <h2 className="venda-rapida-title">
                <MdFlashOn size={24} aria-hidden />
                Registrar venda rápida
              </h2>
              <p className="venda-rapida-desc">Informe o total da venda em reais e o método de pagamento. A venda será adicionada ao histórico como &quot;venda rapida&quot;.</p>
              <div className="venda-rapida-form">
                <label className="venda-rapida-label" htmlFor="quick-sale-total">
                  Total (R$)
                </label>
                <input
                  id="quick-sale-total"
                  type="text"
                  inputMode="decimal"
                  className="venda-rapida-input"
                  value={quickSaleTotal}
                  onChange={(e) => setQuickSaleTotal(e.target.value)}
                  placeholder="0,00"
                  aria-label="Valor total da venda em reais"
                />
                <p className="add-label venda-rapida-methods-label">Método de pagamento</p>
                <div className="close-account-methods venda-rapida-methods">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={`add-btn close-account-method-btn ${quickSalePaymentMethod === method ? 'close-account-method-btn--selected' : ''}`}
                      onClick={() => setQuickSalePaymentMethod(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="add-btn add-btn--primary venda-rapida-submit"
                  disabled={Math.round(parsePrice(quickSaleTotal) * 100) / 100 <= 0 || quickSalePaymentMethod == null}
                  onClick={submitQuickSale}
                >
                  Registrar venda
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'historico' && (() => {
          const filteredHistory = historicoPaymentFilter === null
            ? history
            : history.filter((e) => (e.paymentMethod ?? '') === historicoPaymentFilter)
          const filteredTotalByMethod = filteredHistory.reduce((s, e) => s + historyEntryTotal(e), 0)
          const showTotalByMethod = historicoPaymentFilter !== null && filteredHistory.length > 0
          return (
            <section className={`historico ${showTotalByMethod ? 'historico--has-total' : ''}`} id="panel-historico" role="tabpanel" aria-labelledby="tab-historico">
              <div className="historico-header-row">
                <div className="historico-filters">
                  <button
                    type="button"
                    className={`historico-filter-pill ${historicoPaymentFilter === null ? 'historico-filter-pill--active' : ''}`}
                    onClick={() => setHistoricoPaymentFilter(null)}
                  >
                    Todos
                  </button>
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={`historico-filter-pill ${historicoPaymentFilter === method ? 'historico-filter-pill--active' : ''}`}
                      onClick={() => setHistoricoPaymentFilter(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="historico-pdf-btn"
                  onClick={() => { setRelatorioTipo('completo'); setRelatorioPeriodo('24h'); setRelatorioModalOpen(true) }}
                  disabled={history.length === 0}
                  aria-label="Imprimir relatório"
                >
                  <MdPictureAsPdf size={20} aria-hidden />
                  Imprimir relatório
                </button>
              </div>
              <div className="historico-list">
                {history.length === 0 ? (
                  <p className="historico-empty">Nenhuma venda consolidada ainda.</p>
                ) : filteredHistory.length === 0 ? (
                  <p className="historico-empty">Nenhuma venda com este método de pagamento.</p>
                ) : (
                  filteredHistory.map((entry) => (
                    <article key={entry.id} className="historico-card">
                      <div className="historico-card-header">
                        <h2 className="historico-card-title">
                          <MdReceipt size={20} className="historico-card-icon" aria-hidden />
                          {entry.clientName}
                        </h2>
                        <span className="historico-card-total">{formatMoney(historyEntryTotal(entry))}</span>
                      </div>
                      <p className="historico-card-date">
                        {formatDate(entry.paidAt)}
                        {entry.paymentMethod != null && entry.paymentMethod !== '' && (
                          <span className="historico-card-payment"> · {entry.paymentMethod}</span>
                        )}
                      </p>
                      <ul className="historico-orders">
                        {entry.orders.map((order) => (
                          <li key={order.id} className="historico-order">
                            <span className="historico-order-desc">
                              {(() => {
                                const { baseDescription, quantity } = parseOrderForEdit(order.description, order.quantity)
                                return (
                                  <>
                                    {baseDescription}
                                    {quantity > 1 && <span className="historico-order-qty"> x{quantity}</span>}
                                  </>
                                )
                              })()}
                            </span>
                            <span className="historico-order-amount">{formatMoney(order.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))
                )}
              </div>
              {showTotalByMethod && (
                <div className="historico-total-by-method" aria-live="polite">
                  <span className="historico-total-by-method-label">Total em {historicoPaymentFilter}</span>
                  <span className="historico-total-by-method-value">{formatMoney(filteredTotalByMethod)}</span>
                </div>
              )}
            </section>
          )
        })()}

        {activeTab === 'produtos' && (
          <section className="produtos-workspace" id="panel-produtos" role="tabpanel" aria-labelledby="tab-produtos">
            <div className="produtos-actions">
              <button
                type="button"
                className="produtos-btn produtos-btn--primary"
                onClick={() => { setNewCategoryName(''); setNewCategoryOpen(true) }}
                aria-label="Nova categoria"
              >
                <MdAdd size={20} aria-hidden />
                Nova categoria
              </button>
              <button
                type="button"
                className="produtos-btn produtos-btn--secondary"
                onClick={() => {
                  if (categoriesWithItems.length === 0) return
                  setNewProductCategoryId(categoriesWithItems[0].id)
                  setNewProductName('')
                  setNewProductPrice('')
                  setNewProductPriceDrink('')
                  setNewProductPriceTakeaway('')
                  setNewProductPriceMode('single')
                  setNewProductOpen(true)
                }}
                disabled={categoriesWithItems.length === 0}
                aria-label="Novo produto"
              >
                <MdAdd size={20} aria-hidden />
                Novo produto
              </button>
            </div>
            <div className="produtos-list">
              {categoriesWithItems.length === 0 ? (
                <p className="produtos-empty">Nenhuma categoria ainda. Crie uma categoria e depois adicione produtos.</p>
              ) : (
                [...categoriesWithItems]
                  .sort((a, b) => {
                    if (a.name === 'Outros') return -1
                    if (b.name === 'Outros') return 1
                    return a.sortOrder - b.sortOrder
                  })
                  .map((cat) => (
                  <article
                    key={cat.id}
                    className="produtos-category-card"
                    style={{
                      gridRow: 'span ' + (4 + (cat.items.length === 0 ? 1 : Math.ceil(cat.items.length * 1.5))),
                    }}
                  >
                    <div className="produtos-category-header">
                      <h2 className="produtos-category-title">
                        <MdRestaurantMenu size={20} className="produtos-category-icon" aria-hidden />
                        {cat.name}
                      </h2>
                      <button
                        type="button"
                        className="produtos-add-item-btn"
                        onClick={() => {
                          setNewProductCategoryId(cat.id)
                          setNewProductName('')
                          setNewProductPrice('')
                          setNewProductPriceDrink('')
                          setNewProductPriceTakeaway('')
                          setNewProductPriceMode('single')
                          setNewProductOpen(true)
                        }}
                        aria-label={`Adicionar produto em ${cat.name}`}
                      >
                        <MdAdd size={18} aria-hidden />
                        Produto
                      </button>
                    </div>
                    <ul className="produtos-items">
                      {cat.items.length === 0 ? (
                        <li className="produtos-item-empty">Nenhum item nesta categoria.</li>
                      ) : (
                        cat.items.map((item) => (
                          <li key={item.id} className="produtos-item">
                            <span className="produtos-item-info">
                              <span className="produtos-item-name">{item.name}</span>
                              <span className="produtos-item-prices">
                                {item.priceDrink != null && item.priceTakeaway != null
                                  ? `${formatMoney(item.priceDrink)} / ${formatMoney(item.priceTakeaway)}`
                                  : item.price != null
                                    ? formatMoney(item.price)
                                    : '—'}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="produtos-item-edit"
                              onClick={() => {
                                setEditProductModal({ item, categoryId: cat.id })
                                setEditProductName(item.name)
                                setEditProductPrice((item.price ?? 0).toFixed(2).replace('.', ','))
                                setEditProductPriceDrink((item.priceDrink ?? 0).toFixed(2).replace('.', ','))
                                setEditProductPriceTakeaway((item.priceTakeaway ?? 0).toFixed(2).replace('.', ','))
                                setEditProductPriceMode(
                                  item.priceDrink != null && item.priceTakeaway != null ? 'beberLevar' : 'single'
                                )
                              }}
                              aria-label={`Editar ${item.name}`}
                            >
                              <MdEdit size={18} aria-hidden />
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {/* Overlay + Add Sale panel */}
      <div
        className={`add-overlay ${addOpen ? 'add-overlay--open' : ''}`}
        onClick={() => setAddOpen(false)}
        aria-hidden={!addOpen}
      />
      <div
        className={`add-panel-wrap add-panel-wrap--order ${addOpen ? 'add-panel-wrap--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-sale-title"
      >
        <div className="add-panel add-panel--order" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="add-panel-close"
            onClick={() => setAddOpen(false)}
            aria-label="Fechar"
          >
            <MdClose size={20} aria-hidden />
          </button>
          <h2 id="add-sale-title" className="add-title add-title--client">
            <MdReceipt size={22} aria-hidden />
            {tables.find((t) => t.id === saleTableId)?.name ?? 'Nova venda'}
          </h2>
          <p className="add-desc">Anotar pedido nesta mesa. Escolha a categoria e depois o item.</p>

          <div className="add-order-search-wrap">
            <MdSearch size={20} className="add-order-search-icon" aria-hidden />
            <input
              type="search"
              className="add-order-search-input"
              placeholder="Buscar produto..."
              value={addOrderSearchQuery}
              onChange={(e) => {
                setAddOrderSearchQuery(e.target.value)
                setSelectedCategoryIndex(null)
              }}
              onFocus={() => setSelectedCategoryIndex(null)}
              aria-label="Buscar produto"
            />
          </div>

          <div className="add-order-categories">
            <span className="add-order-section-label">Categoria</span>
            <div className="add-order-category-grid">
              {menu.map((cat, idx) => (
                <button
                  key={cat.category}
                  type="button"
                  className={`add-order-category-btn ${selectedCategoryIndex === idx ? 'add-order-category-btn--active' : ''}`}
                  onClick={() => { setAddOrderSearchQuery(''); setSelectedCategoryIndex(idx) }}
                >
                  {cat.category}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="add-order-custom-product-btn"
              onClick={openCustomProductModal}
            >
              <MdAdd size={18} aria-hidden />
              Adicionar Manualmente Outro Produto
            </button>
          </div>

          {addOrderSearchQuery.trim() !== '' ? (
            <div className="add-order-products add-order-products--search">
              <div className="add-order-product-grid-scroll">
                {menu.map((cat) => {
                  const q = normalizeForSearch(addOrderSearchQuery.trim().toLowerCase())
                  const filtered = cat.items.filter((item) => normalizeForSearch(item.name).toLowerCase().includes(q))
                  if (filtered.length === 0) return null
                  return (
                    <div key={cat.category} className="add-order-search-section">
                      <span className="add-order-section-label add-order-search-section-label">{cat.category}</span>
                      <div className="add-order-product-grid">
                        {filtered.map((item) => {
                          const hasBeberLevar = 'priceDrink' in item && item.priceDrink != null && item.priceTakeaway != null
                          if (hasBeberLevar) {
                            return (
                              <button
                                key={`${cat.category}-${item.name}`}
                                type="button"
                                className="add-order-product-btn"
                                onClick={() => setPendingProductChoice({
                                  productName: item.name,
                                  categoryName: cat.category,
                                  quantity: 1,
                                  priceDrink: item.priceDrink!,
                                  priceTakeaway: item.priceTakeaway!,
                                })}
                              >
                                <span className="add-order-product-name">{item.name}</span>
                                <span className="add-order-product-price">
                                  {formatMoney(item.priceDrink!)} / {formatMoney(item.priceTakeaway!)}
                                </span>
                              </button>
                            )
                          }
                          const price = 'price' in item ? (item.price ?? 0) : 0
                          return (
                            <button
                              key={`${cat.category}-${item.name}`}
                              type="button"
                              className="add-order-product-btn"
                              onClick={() => setPendingProductChoice({
                                productName: item.name,
                                categoryName: cat.category,
                                quantity: 1,
                                price,
                              })}
                            >
                              <span className="add-order-product-name">{item.name}</span>
                              <span className="add-order-product-price">{formatMoney(price)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : selectedCategoryIndex !== null && menu[selectedCategoryIndex] ? (
            <div className="add-order-products">
              <div className="add-order-products-header">
                <span className="add-order-section-label">{menu[selectedCategoryIndex].category}</span>
                <button
                  type="button"
                  className="add-order-back"
                  onClick={() => { setSelectedCategoryIndex(null); setPendingProductChoice(null) }}
                >
                  Voltar
                </button>
              </div>
              <div className="add-order-product-grid-scroll">
              <div className="add-order-product-grid">
                {menu[selectedCategoryIndex].items.map((item) => {
                  const hasBeberLevar = 'priceDrink' in item && item.priceDrink != null && item.priceTakeaway != null
                  if (hasBeberLevar) {
                    return (
                      <button
                        key={item.name}
                        type="button"
                        className="add-order-product-btn"
                        onClick={() => setPendingProductChoice({
                          productName: item.name,
                          categoryName: menu[selectedCategoryIndex].category,
                          quantity: 1,
                          priceDrink: item.priceDrink!,
                          priceTakeaway: item.priceTakeaway!,
                        })}
                      >
                        <span className="add-order-product-name">{item.name}</span>
                        <span className="add-order-product-price">
                          {formatMoney(item.priceDrink!)} / {formatMoney(item.priceTakeaway!)}
                        </span>
                      </button>
                    )
                  }
                  const price = 'price' in item ? (item.price ?? 0) : 0
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className="add-order-product-btn"
                      onClick={() => setPendingProductChoice({
                        productName: item.name,
                        categoryName: menu[selectedCategoryIndex].category,
                        quantity: 1,
                        price,
                      })}
                    >
                      <span className="add-order-product-name">{item.name}</span>
                      <span className="add-order-product-price">{formatMoney(price)}</span>
                    </button>
                  )
                })}
              </div>
              </div>
            </div>
          ) : null}

          {pendingProductChoice && (
            <>
              <div
                className="add-order-beber-levar-backdrop"
                aria-hidden
                onClick={() => setPendingProductChoice(null)}
              />
              <div
                className="add-order-beber-levar-popover add-order-quantity-popover"
                role="dialog"
                aria-modal="true"
                aria-label={`Quantidade: ${pendingProductChoice.productName}`}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="add-order-beber-levar-label add-order-quantity-label">
                  {pendingProductChoice.productName} x{pendingProductChoice.quantity}
                </span>
                <div className="add-order-quantity-controls">
                  <button
                    type="button"
                    className="add-order-quantity-btn"
                    onClick={() => setPendingProductChoice((p) => p && p.quantity > 1 ? { ...p, quantity: p.quantity - 1 } : p)}
                    aria-label="Diminuir quantidade"
                  >
                    −
                  </button>
                  <span className="add-order-quantity-value">{pendingProductChoice.quantity}</span>
                  <button
                    type="button"
                    className="add-order-quantity-btn"
                    onClick={() => setPendingProductChoice((p) => p ? { ...p, quantity: p.quantity + 1 } : p)}
                    aria-label="Aumentar quantidade"
                  >
                    +
                  </button>
                </div>
                <div className="add-order-quantity-btns">
                  {pendingProductChoice.priceDrink != null && pendingProductChoice.priceTakeaway != null ? (
                    <>
                      <button
                        type="button"
                        className="add-order-beber-levar-btn add-order-beber-levar-btn--beber"
                        onClick={() => {
                          const q = pendingProductChoice.quantity
                          const desc = `${pendingProductChoice.productName} ${getBeverageVolumePrefix(pendingProductChoice.categoryName)}(beber)`
                          addOrderFromProduct(desc, pendingProductChoice.priceDrink! * q, q)
                          setPendingProductChoice(null)
                        }}
                      >
                        Beber {formatMoney(pendingProductChoice.priceDrink * pendingProductChoice.quantity)}
                      </button>
                      <button
                        type="button"
                        className="add-order-beber-levar-btn add-order-beber-levar-btn--levar"
                        onClick={() => {
                          const q = pendingProductChoice.quantity
                          const desc = `${pendingProductChoice.productName} ${getBeverageVolumePrefix(pendingProductChoice.categoryName)}(levar)`
                          addOrderFromProduct(desc, pendingProductChoice.priceTakeaway! * q, q)
                          setPendingProductChoice(null)
                        }}
                      >
                        Levar {formatMoney(pendingProductChoice.priceTakeaway * pendingProductChoice.quantity)}
                      </button>
                    </>
                  ) : pendingProductChoice.price != null ? (
                    <button
                      type="button"
                      className="add-order-beber-levar-btn add-order-quantity-add-btn"
                      onClick={() => {
                        const q = pendingProductChoice.quantity
                        const desc = formatOrderDescription(pendingProductChoice.productName, pendingProductChoice.categoryName)
                        addOrderFromProduct(desc, pendingProductChoice.price! * q, q)
                        setPendingProductChoice(null)
                      }}
                    >
                      Adicionar {formatMoney(pendingProductChoice.price * pendingProductChoice.quantity)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="add-order-beber-levar-cancel"
                    onClick={() => setPendingProductChoice(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </>
          )}

          {customProductModalOpen && (
            <>
              <div
                className="add-order-beber-levar-backdrop add-order-custom-product-backdrop"
                aria-hidden
                onClick={() => setCustomProductModalOpen(false)}
              />
              <div
                className="add-order-beber-levar-popover add-order-custom-product-popover"
                role="dialog"
                aria-modal="true"
                aria-labelledby="custom-product-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="custom-product-title" className="add-order-custom-product-title">
                  Anotar produto novo
                </h3>
                <form
                  className="add-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const name = customProductName.trim()
                    const amount = parsePrice(customProductPrice)
                    if (name && amount > 0) {
                      const displayName = name.charAt(0).toUpperCase() + name.slice(1)
                      addOrderFromProduct(displayName, amount)
                      // Save to Produtos DB in default "Outros" category with this price
                      const cats = await getCategoriesWithItems()
                      let outros = cats.find((c) => c.name === 'Outros')
                      if (!outros) {
                        const newCat = await dbAddCategory('Outros')
                        outros = { id: newCat.id, name: newCat.name, sortOrder: newCat.sortOrder, items: [] }
                      }
                      await dbAddMenuItem(outros.id, { name: displayName, price: amount })
                      await refreshProductsAndMenu()
                      setCustomProductModalOpen(false)
                      setCustomProductName('')
                      setCustomProductPrice('')
                    }
                  }}
                >
                  <label className="add-label">Nome do produto</label>
                  <input
                    type="text"
                    className="add-input"
                    placeholder="Ex: Suco de laranja"
                    value={customProductName}
                    onChange={(e) => setCustomProductName(e.target.value)}
                    aria-label="Nome do produto"
                  />
                  <label className="add-label">Valor (R$)</label>
                  <div className="price-input-wrap">
                    <button
                      type="button"
                      className="price-input-btn price-input-btn--minus"
                      onClick={() => {
                        const v = Math.max(0, parsePrice(customProductPrice) - 0.5)
                        setCustomProductPrice(v === 0 ? '' : formatPrice(v))
                      }}
                      aria-label="Diminuir R$ 0,50"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="add-input price-input"
                      value={customProductPrice}
                      onChange={(e) => setCustomProductPrice(e.target.value.replace(/[^\d,.]/g, ''))}
                      aria-label="Valor em reais"
                    />
                    <button
                      type="button"
                      className="price-input-btn price-input-btn--plus"
                      onClick={() => {
                        const v = parsePrice(customProductPrice) + 0.5
                        setCustomProductPrice(formatPrice(v))
                      }}
                      aria-label="Aumentar R$ 0,50"
                    >
                      +
                    </button>
                  </div>
                  <div className="add-order-custom-product-actions">
                    <button type="submit" className="add-btn add-btn--primary" disabled={!customProductName.trim() || parsePrice(customProductPrice) <= 0}>
                      <MdAdd size={18} aria-hidden />
                      Adicionar à mesa
                    </button>
                    <button
                      type="button"
                      className="add-order-beber-levar-cancel"
                      onClick={() => setCustomProductModalOpen(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          <div className="add-order-footer">
            <button
              type="button"
              className="add-btn add-btn--primary"
              onClick={() => setAddOpen(false)}
            >
              Concluir e fechar
            </button>
          </div>
        </div>
      </div>

      {/* New Table panel */}
      <div
        className={`add-overlay ${newTableOpen ? 'add-overlay--open' : ''}`}
        onClick={() => setNewTableOpen(false)}
        aria-hidden={!newTableOpen}
      />
      <div
        className={`add-panel-wrap ${newTableOpen ? 'add-panel-wrap--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-table-title"
      >
        <div className="add-panel" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="add-panel-close"
            onClick={() => setNewTableOpen(false)}
            aria-label="Fechar"
          >
            <MdClose size={20} aria-hidden />
          </button>
          <h2 id="add-table-title" className="add-title">
            <MdTableRestaurant size={20} aria-hidden />
            Nome do Cliente
          </h2>
          <p className="add-desc">Informe o nome do cliente para criar a mesa.</p>
          <form
            className="add-form"
            onSubmit={(e) => {
              e.preventDefault()
              addTable()
            }}
          >
            <label className="add-label">Nome do Cliente</label>
            <input
              ref={newTableInputRef}
              type="text"
              placeholder="Ex: João Silva, Mesa 5"
              className="add-input"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value.slice(0, 15))}
              maxLength={15}
              aria-label="Nome do Cliente"
            />
            <button type="submit" className="add-btn add-btn--primary" disabled={!newTableName.trim()}>
              <MdAdd size={20} aria-hidden />
              Criar mesa
            </button>
          </form>
        </div>
      </div>

      {/* New category modal (Produtos tab) */}
      {newCategoryOpen && (
        <>
          <div
            className="add-overlay add-overlay--open"
            onClick={() => setNewCategoryOpen(false)}
            aria-hidden
          />
          <div
            className="add-panel-wrap add-panel-wrap--open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-category-title"
          >
            <div className="add-panel" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="add-panel-close" onClick={() => setNewCategoryOpen(false)} aria-label="Fechar">
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="new-category-title" className="add-title">
                <MdRestaurantMenu size={20} aria-hidden />
                Nova categoria
              </h2>
              <p className="add-desc">Ex: Bebidas, Doces, Padaria.</p>
              <form
                className="add-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = newCategoryName.trim()
                  if (!name) return
                  dbAddCategory(name).then(() => {
                    refreshProductsAndMenu()
                    setNewCategoryOpen(false)
                    setNewCategoryName('')
                    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Categoria criada', type: 'success' }])
                  })
                }}
              >
                <label className="add-label">Nome da categoria</label>
                <input
                  type="text"
                  className="add-input"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Bebidas quentes"
                  aria-label="Nome da categoria"
                />
                <button type="submit" className="add-btn add-btn--primary" disabled={!newCategoryName.trim()}>
                  <MdAdd size={18} aria-hidden />
                  Criar categoria
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* New product modal (Produtos tab) */}
      {newProductOpen && categoriesWithItems.length > 0 && (
        <>
          <div
            className="add-overlay add-overlay--open"
            onClick={() => setNewProductOpen(false)}
            aria-hidden
          />
          <div
            className="add-panel-wrap add-panel-wrap--open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-product-title"
          >
            <div className="add-panel add-panel--product-form" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="add-panel-close" onClick={() => setNewProductOpen(false)} aria-label="Fechar">
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="new-product-title" className="add-title">
                <MdAdd size={20} aria-hidden />
                Novo produto
              </h2>
              <form
                className="add-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = newProductName.trim()
                  if (!name) return
                  const payload =
                    newProductPriceMode === 'beberLevar'
                      ? {
                          name,
                          priceDrink: parsePrice(newProductPriceDrink),
                          priceTakeaway: parsePrice(newProductPriceTakeaway),
                        }
                      : { name, price: parsePrice(newProductPrice) }
                  dbAddMenuItem(newProductCategoryId, payload).then(() => {
                    refreshProductsAndMenu()
                    setNewProductOpen(false)
                    setNewProductName('')
                    setNewProductPrice('')
                    setNewProductPriceDrink('')
                    setNewProductPriceTakeaway('')
                    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Produto adicionado', type: 'success' }])
                  })
                }}
              >
                <label className="add-label">Categoria</label>
                <select
                  className="add-input"
                  value={newProductCategoryId}
                  onChange={(e) => setNewProductCategoryId(e.target.value)}
                  aria-label="Categoria"
                >
                  {categoriesWithItems.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <label className="add-label">Nome do produto</label>
                <input
                  type="text"
                  className="add-input"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Ex: Café expresso"
                  aria-label="Nome do produto"
                />
                <div className="produtos-price-mode">
                  <button
                    type="button"
                    className={`produtos-mode-btn ${newProductPriceMode === 'single' ? 'produtos-mode-btn--active' : ''}`}
                    onClick={() => setNewProductPriceMode('single')}
                  >
                    Preço único
                  </button>
                  <button
                    type="button"
                    className={`produtos-mode-btn ${newProductPriceMode === 'beberLevar' ? 'produtos-mode-btn--active' : ''}`}
                    onClick={() => setNewProductPriceMode('beberLevar')}
                  >
                    Beber / Levar
                  </button>
                </div>
                {newProductPriceMode === 'single' ? (
                  <>
                    <label className="add-label">Preço (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label className="add-label">Beber (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={newProductPriceDrink}
                        onChange={(e) => setNewProductPriceDrink(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço beber"
                      />
                    </div>
                    <label className="add-label">Levar (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={newProductPriceTakeaway}
                        onChange={(e) => setNewProductPriceTakeaway(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço levar"
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  className="add-btn add-btn--primary"
                  disabled={
                    !newProductName.trim() ||
                    (newProductPriceMode === 'single'
                      ? parsePrice(newProductPrice) <= 0
                      : parsePrice(newProductPriceDrink) <= 0 || parsePrice(newProductPriceTakeaway) <= 0)
                  }
                >
                  <MdAdd size={18} aria-hidden />
                  Adicionar produto
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Edit product modal (Produtos tab) */}
      {editProductModal && (
        <>
          <div
            className="add-overlay add-overlay--open"
            onClick={() => setEditProductModal(null)}
            aria-hidden
          />
          <div
            className="add-panel-wrap add-panel-wrap--open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
          >
            <div className="add-panel add-panel--product-form" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="add-panel-close" onClick={() => setEditProductModal(null)} aria-label="Fechar">
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="edit-product-title" className="add-title">
                <MdEdit size={20} aria-hidden />
                Editar produto
              </h2>
              <form
                className="add-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = editProductName.trim()
                  if (!name || !editProductModal) return
                  const updates =
                    editProductPriceMode === 'beberLevar'
                      ? {
                          name,
                          price: undefined,
                          priceDrink: parsePrice(editProductPriceDrink),
                          priceTakeaway: parsePrice(editProductPriceTakeaway),
                        }
                      : {
                          name,
                          price: parsePrice(editProductPrice),
                          priceDrink: null as number | null,
                          priceTakeaway: null as number | null,
                        }
                  dbUpdateMenuItem(editProductModal.item.id, updates).then(() => {
                    refreshProductsAndMenu()
                    setEditProductModal(null)
                    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Produto atualizado', type: 'success' }])
                  })
                }}
              >
                <label className="add-label">Nome do produto</label>
                <input
                  type="text"
                  className="add-input"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  aria-label="Nome do produto"
                />
                <div className="produtos-price-mode">
                  <button
                    type="button"
                    className={`produtos-mode-btn ${editProductPriceMode === 'single' ? 'produtos-mode-btn--active' : ''}`}
                    onClick={() => setEditProductPriceMode('single')}
                  >
                    Preço único
                  </button>
                  <button
                    type="button"
                    className={`produtos-mode-btn ${editProductPriceMode === 'beberLevar' ? 'produtos-mode-btn--active' : ''}`}
                    onClick={() => setEditProductPriceMode('beberLevar')}
                  >
                    Beber / Levar
                  </button>
                </div>
                {editProductPriceMode === 'single' ? (
                  <>
                    <label className="add-label">Preço (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={editProductPrice}
                        onChange={(e) => setEditProductPrice(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label className="add-label">Beber (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={editProductPriceDrink}
                        onChange={(e) => setEditProductPriceDrink(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço beber"
                      />
                    </div>
                    <label className="add-label">Levar (R$)</label>
                    <div className="price-input-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="price-input add-input"
                        value={editProductPriceTakeaway}
                        onChange={(e) => setEditProductPriceTakeaway(e.target.value.replace(/[^\d,.]/g, ''))}
                        aria-label="Preço levar"
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  className="add-btn add-btn--primary"
                  disabled={
                    !editProductName.trim() ||
                    (editProductPriceMode === 'single'
                      ? parsePrice(editProductPrice) <= 0
                      : parsePrice(editProductPriceDrink) <= 0 || parsePrice(editProductPriceTakeaway) <= 0)
                  }
                >
                  Salvar alterações
                </button>
                <button
                  type="button"
                  className="add-btn confirm-btn-remove produtos-delete-btn"
                  onClick={() =>
                    editProductModal &&
                    setRemoveProductConfirm({
                      itemName: editProductName.trim() || editProductModal.item.name,
                      itemId: editProductModal.item.id,
                      categoryId: editProductModal.categoryId,
                    })
                  }
                  aria-label="Deletar produto"
                >
                  Deletar produto
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Remove product confirmation modal */}
      {removeProductConfirm && (
        <>
          <div
            className="confirm-overlay"
            onClick={() => setRemoveProductConfirm(null)}
            aria-hidden
          />
          <div
            className="confirm-panel-wrap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-product-title"
            aria-describedby="confirm-product-desc"
          >
            <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
              <h2 id="confirm-product-title" className="confirm-title">
                Deletar produto
              </h2>
              <p id="confirm-product-desc" className="confirm-desc">
                Deletar <strong>"{removeProductConfirm.itemName}"</strong> do cardápio? A categoria será removida se não restar nenhum outro produto.
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="add-btn confirm-btn-cancel"
                  onClick={() => setRemoveProductConfirm(null)}
                >
                  Não
                </button>
                <button
                  type="button"
                  className="add-btn confirm-btn-remove"
                  onClick={async () => {
                    const { itemId, categoryId, itemName } = removeProductConfirm
                    await dbDeleteMenuItem(itemId)
                    const remaining = await getCategoryItemCount(categoryId)
                    if (remaining === 0) await dbDeleteCategory(categoryId)
                    await refreshProductsAndMenu()
                    setRemoveProductConfirm(null)
                    setEditProductModal(null)
                    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${itemName} removido do cardápio`, type: 'remove' }])
                  }}
                >
                  Sim, deletar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit order modal */}
      {editOrderModal && (
        <>
          <div
            className="add-overlay edit-order-overlay edit-order-overlay--open"
            onClick={closeEditOrderModal}
            aria-hidden
          />
          <div
            className="add-panel-wrap edit-order-panel-wrap edit-order-panel-wrap--open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-order-title"
          >
            <div className="add-panel edit-order-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="add-panel-close"
                onClick={closeEditOrderModal}
                aria-label="Fechar"
              >
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="edit-order-title" className="add-title">
                <MdSettings size={20} aria-hidden />
                Item da mesa
              </h2>
              <p className="add-desc edit-order-item-name">
                <strong>{orderDisplayLabel(editOrderModal.order)}</strong>
              </p>
              <form
                className="add-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const unit = parsePrice(editOrderUnitPrice)
                  if (!isNaN(unit) && unit > 0 && editOrderQuantity >= 1) {
                    updateOrder(
                      editOrderModal.tableId,
                      editOrderModal.order.id,
                      editOrderDescription.trim(),
                      editOrderQuantity,
                      unit
                    )
                  }
                }}
              >
                <label className="add-label">Descrição</label>
                <input
                  type="text"
                  className="add-input"
                  value={editOrderDescription}
                  onChange={(e) => setEditOrderDescription(e.target.value)}
                  placeholder="Nome do item"
                />
                <label className="add-label">Quantidade</label>
                <div className="edit-order-qty-wrap">
                  <button
                    type="button"
                    className="edit-order-qty-btn"
                    onClick={() => setEditOrderQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Diminuir quantidade"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    className="add-input edit-order-qty-input"
                    value={editOrderQuantity}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      if (!isNaN(n) && n >= 1) setEditOrderQuantity(n)
                    }}
                  />
                  <button
                    type="button"
                    className="edit-order-qty-btn"
                    onClick={() => setEditOrderQuantity((q) => q + 1)}
                    aria-label="Aumentar quantidade"
                  >
                    +
                  </button>
                </div>
                <label className="add-label">Preço unitário (R$)</label>
                <div className="edit-order-price-wrap">
                  <span className="edit-order-currency">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="add-input edit-order-price-input"
                    value={editOrderUnitPrice}
                    onChange={(e) =>
                      setEditOrderUnitPrice(e.target.value.replace(/[^\d,.]/g, ''))
                    }
                  />
                </div>
                {editOrderQuantity > 1 && (
                  <p className="edit-order-total-line" aria-live="polite">
                    Total: <strong>{formatMoney(parsePrice(editOrderUnitPrice) * editOrderQuantity)}</strong>
                  </p>
                )}
                <div className="edit-order-actions">
                  <button
                    type="button"
                    className="add-btn edit-order-btn-remove"
                    onClick={() =>
                      setRemoveConfirm({
                        tableId: editOrderModal.tableId,
                        orderId: editOrderModal.order.id,
                        description: orderDisplayLabel(editOrderModal.order),
                      })
                    }
                  >
                    Remover item
                  </button>
                  <div className="edit-order-actions-right">
                    <button
                      type="submit"
                      className="add-btn edit-order-btn-save"
                      disabled={
                        !editOrderDescription.trim() ||
                        !editOrderUnitPrice.trim() ||
                        isNaN(parsePrice(editOrderUnitPrice)) ||
                        parsePrice(editOrderUnitPrice) <= 0 ||
                        editOrderQuantity < 1
                      }
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="add-btn edit-order-btn-cancel"
                      onClick={closeEditOrderModal}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Remove item confirmation modal */}
      {removeConfirm && (
        <>
          <div
            className="confirm-overlay"
            onClick={() => setRemoveConfirm(null)}
            aria-hidden
          />
          <div
            className="confirm-panel-wrap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
              <h2 id="confirm-title" className="confirm-title">
                Remover item
              </h2>
              <p id="confirm-desc" className="confirm-desc">
                Remover <strong>"{removeConfirm.description}"</strong> do pedido?
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="add-btn confirm-btn-cancel"
                  onClick={() => setRemoveConfirm(null)}
                >
                  Não
                </button>
                <button
                  type="button"
                  className="add-btn confirm-btn-remove"
                  onClick={() => {
                    const description = removeConfirm.description
                    removeOrder(removeConfirm.tableId, removeConfirm.orderId)
                    setRemoveConfirm(null)
                    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: `${description} removido do pedido`, type: 'remove' }])
                  }}
                >
                  Sim, remover
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Fechar a conta — payment method modal */}
      {closeAccountModal && (
        <>
          <div
            className={`add-overlay close-account-overlay close-account-overlay--open ${closeAccountExiting ? 'close-account-overlay--exiting' : ''}`}
            onClick={() => { setCloseAccountModal(null); setSelectedPaymentMethod(null) }}
            aria-hidden
          />
          <div
            className={`add-panel-wrap close-account-panel-wrap close-account-panel-wrap--open ${closeAccountExiting ? 'close-account-panel-wrap--exiting' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-account-title"
          >
            <div className="add-panel close-account-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="add-panel-close"
                onClick={() => { setCloseAccountModal(null); setSelectedPaymentMethod(null) }}
                aria-label="Fechar"
              >
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="close-account-title" className="add-title add-title--client">
                <MdReceipt size={20} aria-hidden />
                {closeAccountModal.name}
              </h2>
              <p className="add-desc close-account-subtitle">Fechar a conta.</p>
              <p className="close-account-total">
                Total: <strong>{formatMoney(tableTotal(closeAccountModal))}</strong>
              </p>
              <div className="close-account-summary-scroll">
                <ul className="close-account-summary">
                  {closeAccountModal.orders.map((order) => (
                    <li key={order.id} className="close-account-summary-item">
                      <span className="close-account-summary-desc">{orderDisplayLabel(order)}</span>
                      <span className="close-account-summary-amount">{formatMoney(order.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="add-label close-account-label">Registrar pagamento com:</p>
              <div className="close-account-methods">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`add-btn close-account-method-btn ${selectedPaymentMethod === method ? 'close-account-method-btn--selected' : ''}`}
                    onClick={() => setSelectedPaymentMethod(method)}
                  >
                    {method}
                  </button>
                ))}
              </div>
              <div className="close-account-actions">
                <button
                  type="button"
                  className="add-btn close-account-confirm-btn add-btn--primary"
                  disabled={selectedPaymentMethod == null}
                  onClick={() => {
                    if (selectedPaymentMethod) {
                      pendingCloseAccountRef.current = {
                        tableId: closeAccountModal.id,
                        paymentMethod: selectedPaymentMethod,
                        clientName: closeAccountModal.name,
                      }
                      setCloseAccountExiting(true)
                    }
                  }}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="add-btn close-account-cancel-btn"
                  onClick={() => { setCloseAccountModal(null); setSelectedPaymentMethod(null) }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Relatório PDF — tipo de relatório e período */}
      {relatorioModalOpen && (
        <>
          <div
            className="add-overlay close-account-overlay close-account-overlay--open"
            onClick={() => { setRelatorioModalOpen(false); setRelatorioTipo(null); setRelatorioPeriodo('24h') }}
            aria-hidden
          />
          <div
            className="add-panel-wrap close-account-panel-wrap close-account-panel-wrap--open relatorio-panel-wrap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="relatorio-modal-title"
          >
            <div className="add-panel close-account-panel relatorio-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="add-panel-close"
                onClick={() => { setRelatorioModalOpen(false); setRelatorioTipo(null); setRelatorioPeriodo('24h') }}
                aria-label="Fechar"
              >
                <MdClose size={20} aria-hidden />
              </button>
              <h2 id="relatorio-modal-title" className="add-title add-title--client">
                <MdPictureAsPdf size={20} aria-hidden />
                Relatório de vendas (PDF)
              </h2>
              <p className="add-label close-account-label">Período:</p>
              <div className="relatorio-options relatorio-periodo-options">
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioPeriodo === '24h' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioPeriodo('24h')}
                >
                  Últimas 24 horas
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioPeriodo === '48h' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioPeriodo('48h')}
                >
                  Últimas 48 horas
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioPeriodo === 'semana' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioPeriodo('semana')}
                >
                  Última semana
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioPeriodo === 'mes_atual' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioPeriodo('mes_atual')}
                >
                  Mês corrente
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioPeriodo === 'mes_anterior' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioPeriodo('mes_anterior')}
                >
                  Último mês
                </button>
              </div>
              <p className="add-desc close-account-subtitle">Escolha o tipo de relatório:</p>
              <div className="relatorio-options">
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioTipo === 'completo' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioTipo('completo')}
                >
                  Completo
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioTipo === 'credito' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioTipo('credito')}
                >
                  Somente vendas no crédito
                </button>
                <button
                  type="button"
                  className={`add-btn close-account-method-btn ${relatorioTipo === 'anotado' ? 'close-account-method-btn--selected' : ''}`}
                  onClick={() => setRelatorioTipo('anotado')}
                >
                  Somente vendas anotadas na conta
                </button>
              </div>
              <div className="close-account-actions">
                <button
                  type="button"
                  className="add-btn close-account-confirm-btn add-btn--primary"
                  disabled={relatorioTipo == null}
                  onClick={() => relatorioTipo != null && generateRelatorioPdf(relatorioTipo, relatorioPeriodo)}
                >
                  Imprimir
                </button>
                <button
                  type="button"
                  className="add-btn close-account-cancel-btn"
                  onClick={() => { setRelatorioModalOpen(false); setRelatorioTipo(null); setRelatorioPeriodo('24h') }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {[...toasts].reverse().map((t) => (
            <div
              key={t.id}
              className={`toast ${t.type === 'remove' ? 'toast--remove' : ''} ${t.exiting ? 'toast--exiting' : ''}`}
              role="status"
              aria-atomic="true"
            >
              <span className="toast-message">{t.message}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="footer">
        <p className="footer-text">
          iBar-vendas — controle de vendas e mesas para bar e restaurante. 2026{' '}
          <a
            href="https://www.linkedin.com/in/italo-jean-araujo-de-souza/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Ítalo Tecnologia™
          </a>
        </p>
      </footer>

      <style>{styles}</style>
    </div>
  )
}

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <span className="logo-text">iBar-vendas</span>
    </span>
  )
}

const styles = `
  :root {
    --bg: #E2E6EB;
    --bg-card: rgba(255, 255, 255, 0.85);
    --bg-header: rgba(232, 235, 240, 0.9);
    --accent: #2D5A3D;
    --accent-light: #3d7a52;
    --accent-muted: rgba(45, 90, 61, 0.15);
    --text: #1a1d21;
    --text-muted: #4a5568;
    --border: rgba(0, 0, 0, 0.08);
    --radius: 12px;
    --radius-lg: 16px;
    --shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.1);
    --transition: 0.2s ease;
  }

  .welcome-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .welcome-overlay--exited {
    opacity: 0;
    pointer-events: none;
  }

  .welcome-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(232, 236, 240, 0.58);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
  }

  .welcome-modal {
    position: relative;
    z-index: 1;
    max-width: 420px;
    width: 100%;
    padding: 3rem 2.5rem;
    background: var(--bg);
    border-radius: 24px;
    border: none;
    box-shadow:
      12px 12px 24px rgba(0, 0, 0, 0.1),
      -12px -12px 24px rgba(255, 255, 255, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .welcome-overlay--exited .welcome-modal {
    transform: scale(0.96);
  }

  .welcome-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    margin: 0 0 0.5rem;
  }

  .welcome-desc {
    font-size: 1rem;
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 2.25rem;
  }

  .welcome-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    padding: 1.05rem 2.25rem;
    min-width: 200px;
    border: none;
    border-radius: 16px;
    background: var(--accent);
    color: #fff;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
    box-shadow:
      6px 6px 12px rgba(0, 0, 0, 0.1),
      -6px -6px 12px rgba(255, 255, 255, 0.9);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }

  .welcome-cta:hover {
    box-shadow:
      8px 8px 16px rgba(0, 0, 0, 0.1),
      -8px -8px 16px rgba(255, 255, 255, 0.95);
    transform: translateY(-1px);
  }

  .welcome-cta:active {
    box-shadow:
      inset 3px 3px 6px rgba(0, 0, 0, 0.1),
      inset -3px -3px 6px rgba(255, 255, 255, 0.8);
    transform: translateY(0);
  }

  .welcome-cta:focus-visible {
    outline: none;
    box-shadow:
      6px 6px 12px rgba(0, 0, 0, 0.1),
      -6px -6px 12px rgba(255, 255, 255, 0.9),
      0 0 0 3px var(--accent-muted);
  }

  @keyframes bg-float {
    0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
    33% { transform: translate(2%, -1%) scale(1.02); opacity: 0.5; }
    66% { transform: translate(-1%, 2%) scale(0.98); opacity: 0.35; }
  }

  .app-bg {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }

  .app-bg-shape {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    animation: bg-float 18s ease-in-out infinite;
  }

  .app-bg-shape-1 {
    width: 60vmin;
    height: 60vmin;
    background: rgba(45, 90, 61, 0.08);
    top: -10%;
    left: -5%;
    animation-delay: 0s;
  }

  .app-bg-shape-2 {
    width: 50vmin;
    height: 50vmin;
    background: rgba(70, 100, 120, 0.06);
    bottom: -5%;
    right: -5%;
    animation-delay: -6s;
  }

  .app-bg-shape-3 {
    width: 40vmin;
    height: 40vmin;
    background: rgba(45, 90, 61, 0.05);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    animation-delay: -12s;
  }

  .app {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    z-index: 1;
  }

  .app .logo {
    opacity: 0;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: 0.05s;
  }

  .app .header-right {
    opacity: 0;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: 0.1s;
  }

  .app .hero-tagline {
    opacity: 0;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: 0.15s;
  }

  .app .table-card-placeholder {
    opacity: 0;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: 0.2s;
  }

  .app.app--ready .logo,
  .app.app--ready .header-right,
  .app.app--ready .hero-tagline,
  .app.app--ready .table-card-placeholder {
    opacity: 1;
  }

  .header {
    flex-shrink: 0;
    padding: 0.75rem 1.5rem;
    background: var(--bg-header);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }

  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }

  .tabs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--border);
    border-radius: var(--radius);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .tab:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.6);
  }

  .tab--active {
    background: var(--bg-card);
    color: var(--accent);
    box-shadow: var(--shadow);
  }

  .tab svg {
    flex-shrink: 0;
    opacity: 0.85;
  }

  @media (max-width: 640px) {
    .header {
      padding: 0.5rem 1rem;
    }
    .header-right {
      gap: 0.6rem;
    }
    .tabs {
      padding: 0.2rem;
      gap: 0.15rem;
    }
    .tab {
      padding: 0.35rem 0.5rem;
      font-size: 0.8rem;
      gap: 0.25rem;
    }
    .tab svg {
      width: 16px;
      height: 16px;
    }
  }

  .daily-total {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 0.35rem 0.75rem;
    background: var(--accent-muted);
    border-radius: 8px;
  }

  .daily-total-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .daily-total-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent);
  }

  .daily-total--glow {
    animation: daily-total-glow 1.5s ease-out;
  }

  @keyframes daily-total-glow {
    0%, 100% {
      box-shadow: 0 0 0 0 var(--accent-muted);
    }
    30% {
      box-shadow: 0 0 20px 6px var(--accent-muted), 0 0 40px 8px rgba(45, 90, 61, 0.2);
    }
    70% {
      box-shadow: 0 0 16px 4px var(--accent-muted), 0 0 32px 6px rgba(45, 90, 61, 0.15);
    }
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .btn-ghost {
    border: none;
    background: transparent;
    color: var(--text-muted);
  }

  .btn-ghost:hover {
    background: var(--border);
    color: var(--accent);
  }

  .logo {
    color: var(--text);
    font-weight: 700;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    cursor: default;
  }

  .logo-text {
    font-family: 'DM Sans', system-ui, sans-serif;
  }

  .main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 0.5rem 2rem 1rem;
  }

  .hero-tagline {
    font-size: 0.95rem;
    color: var(--text-muted);
    max-width: 480px;
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-bottom: 0.5rem;
  }

  .workspace-grid {
    flex: 1;
    min-height: 0;
    align-content: start;
    align-items: start;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .table-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    overflow: hidden;
    transition: box-shadow var(--transition), transform var(--transition);
    backdrop-filter: blur(8px);
  }

  .table-card:hover {
    box-shadow: var(--shadow-hover);
  }

  .table-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--accent-muted);
  }

  .table-card-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .table-card-header-icon {
    flex-shrink: 0;
    color: var(--accent);
  }

  .table-card-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .table-card-title--client {
    font-family: Georgia, 'Times New Roman', serif;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .table-card-title-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .table-card-title-input:focus {
    outline: none;
  }

  .table-card-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 140px;
    border: 2px dashed var(--border);
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: border-color var(--transition), background var(--transition), color var(--transition);
  }

  .table-card-placeholder:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
    color: var(--accent);
  }

  .table-card-placeholder:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 4px var(--accent),
      0 0 0 6px var(--accent-muted);
  }

  .table-card-placeholder-label {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.1rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .table-card-placeholder:hover .table-card-placeholder-label {
    color: var(--accent);
  }

  .table-card-total {
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
  }

  .table-card-body {
    padding: 1rem 1.25rem;
    min-height: 100px;
    cursor: pointer;
  }

  .table-card-body:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .table-card-empty {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin: 0;
    font-style: italic;
  }

  .table-card-body:hover .table-card-empty {
    color: var(--accent);
  }

  .table-orders {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .table-order {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .table-order:last-child {
    border-bottom: none;
  }

  .table-order-desc {
    color: var(--text);
  }

  .table-order-qty {
    font-size: 0.85em;
    color: var(--text-muted);
    font-weight: 500;
  }

  .table-order-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .table-order-amount {
    font-weight: 600;
    color: var(--accent);
  }

  .table-order-plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.2s, background 0.2s;
  }

  .table-order-plus:hover {
    color: var(--accent);
    background: var(--accent-muted);
  }

  .table-order-plus:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-muted);
  }

  .table-order-gear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.2s, background 0.2s;
  }

  .table-order-gear:hover {
    color: var(--accent);
    background: var(--accent-muted);
  }

  .table-order-gear:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-muted);
  }

  .table-card-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    background: rgba(0, 0, 0, 0.03);
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .table-card-close-btn {
    margin-left: auto;
    padding: 0.35rem 0.7rem;
    border: none;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-muted);
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .table-card-close-btn:hover {
    background: var(--accent);
    color: #fff;
  }

  .venda-rapida-workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem 0;
  }

  .venda-rapida-card {
    width: 100%;
    max-width: 420px;
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    padding: 1.5rem;
    backdrop-filter: blur(8px);
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
  }

  .venda-rapida-card--exiting {
    transform: translateY(-120%) scale(0.2);
    opacity: 0;
    pointer-events: none;
  }

  .venda-rapida-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem;
  }

  .venda-rapida-title svg {
    color: var(--accent);
  }

  .venda-rapida-desc {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin: 0 0 1.25rem;
    line-height: 1.4;
  }

  .venda-rapida-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .venda-rapida-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }

  .venda-rapida-input {
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: 1rem;
    font-family: inherit;
  }

  .venda-rapida-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-muted);
  }

  .venda-rapida-methods-label {
    margin: 0.25rem 0 0;
  }

  .venda-rapida-methods {
    margin: 0;
  }

  .venda-rapida-card .close-account-method-btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
  }

  .venda-rapida-card .close-account-method-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .venda-rapida-card .close-account-method-btn--selected {
    background: #1b5e20;
    border-color: #1b5e20;
    color: #fff;
  }

  .venda-rapida-card .close-account-method-btn--selected:hover {
    background: #2e7d32;
    border-color: #2e7d32;
    color: #fff;
  }

  .venda-rapida-submit {
    margin-top: 0.5rem;
  }

  .historico {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-bottom: 0.5rem;
    position: relative;
  }

  .historico.historico--has-total {
    padding-bottom: 4rem;
  }

  .historico-header-row {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0 0.75rem;
  }

  .historico-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .historico-pdf-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.1s ease;
  }

  .historico-pdf-btn:hover:not(:disabled) {
    background: var(--accent-light);
    border-color: var(--accent-light);
  }

  .historico-pdf-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .historico-pdf-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .historico-filter-pill {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }

  .historico-filter-pill:hover {
    background: var(--accent-muted);
    border-color: var(--accent);
  }

  .historico-filter-pill--active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .historico-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    align-content: start;
  }

  .historico-empty {
    grid-column: 1 / -1;
    font-size: 0.95rem;
    color: var(--text-muted);
    margin: 0;
  }

  .historico-card {
    display: flex;
    flex-direction: column;
    height: calc((100vh - 18rem) / 2);
    min-height: 6rem;
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    overflow: hidden;
    backdrop-filter: blur(8px);
  }

  .historico-card-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: #a8adb4;
  }

  .historico-card-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .historico-card-icon {
    flex-shrink: 0;
    color: #4a4d52;
  }

  .historico-card-total {
    font-size: 0.95rem;
    font-weight: 700;
    color: #4a4d52;
  }

  .historico-card-date {
    flex-shrink: 0;
    padding: 0.25rem 1.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .historico-orders {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.5rem 1.25rem 0.75rem;
  }

  .historico-order {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .historico-order:last-child {
    border-bottom: none;
  }

  .historico-order-desc {
    color: var(--text);
  }

  .historico-order-qty {
    font-size: 0.85em;
    color: var(--text-muted);
    font-weight: 500;
  }

  .historico-order-amount {
    font-weight: 600;
    color: var(--accent);
  }

  .add-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .add-overlay--open {
    opacity: 1;
    pointer-events: auto;
  }

  .add-panel-wrap {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1001;
    max-width: calc(100vw - 3rem);
    transform: translate(-50%, -50%) scale(0.9);
    transform-origin: center;
    opacity: 0;
    pointer-events: none;
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  .add-panel-wrap--open {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    pointer-events: auto;
  }

  .add-panel-wrap .add-panel {
    position: relative;
    padding: 2rem 2.25rem;
    padding-right: 2.75rem;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover);
    border: 1px solid var(--border);
    backdrop-filter: blur(12px);
  }

  .add-panel-wrap--order {
    max-width: min(92vw, 720px);
  }

  .add-panel-wrap--order .add-panel--order {
    display: flex;
    flex-direction: column;
    max-height: 92vh;
    overflow: hidden;
    padding: 2rem 2.25rem 1.5rem;
    padding-right: 2.75rem;
  }

  .add-panel-wrap--order .add-panel--order > .add-panel-close,
  .add-panel-wrap--order .add-panel--order > .add-title,
  .add-panel-wrap--order .add-panel--order > .add-desc {
    flex-shrink: 0;
  }

  .add-order-section-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .add-order-search-wrap {
    position: relative;
    flex-shrink: 0;
    margin-bottom: 0.875rem;
  }

  .add-order-search-icon {
    position: absolute;
    left: 0.875rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  .add-order-search-input {
    width: 100%;
    padding: 0.6rem 1rem 0.6rem 2.5rem;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background: var(--bg-card);
    color: var(--text);
    font-size: 0.9rem;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .add-order-search-input::placeholder {
    color: var(--text-muted);
  }

  .add-order-search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-muted);
  }

  .add-order-categories {
    flex-shrink: 0;
    margin-bottom: 0.75rem;
  }

  .add-order-category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.5rem;
    width: 100%;
  }

  .add-order-category-btn {
    flex: 1 1 auto;
    max-width: 12rem;
    padding: 0.35rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background: var(--bg-card);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
  }

  .add-order-category-btn:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
    box-shadow: 0 2px 6px rgba(45, 90, 61, 0.12);
  }

  .add-order-category-btn--active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
    box-shadow: 0 2px 8px rgba(45, 90, 61, 0.35);
  }

  .add-order-category-btn--active:hover {
    background: var(--accent-light);
    box-shadow: 0 3px 10px rgba(45, 90, 61, 0.4);
  }

  .add-order-products {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
    padding-top: 0.875rem;
    border-top: 1px solid var(--border);
    overflow: hidden;
  }

  .add-order-product-grid-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 0.25rem 0 0;
    padding: 0.25rem 0.75rem 0.5rem 0.5rem;
  }

  .add-order-products-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .add-order-products-header .add-order-section-label {
    margin-bottom: 0;
  }

  .add-order-back {
    padding: 0.4rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background: var(--bg-card);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
  }

  .add-order-back:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .add-order-search-section {
    margin-bottom: 1.25rem;
  }

  .add-order-search-section:last-child {
    margin-bottom: 0;
  }

  .add-order-search-section-label {
    margin-bottom: 0.5rem;
  }

  .add-order-product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.625rem;
  }

  .add-order-product-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    aspect-ratio: 1.2;
    min-height: 0;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-card);
    color: var(--text);
    text-align: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  }

  .add-order-product-btn:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
    box-shadow: 0 4px 12px rgba(45, 90, 61, 0.12);
    transform: translateY(-2px);
  }

  .add-order-product-btn:active {
    transform: translateY(0);
  }

  .add-order-product-name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--text);
    text-align: center;
  }

  .add-order-product-price {
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--accent);
    text-align: center;
  }

  .add-order-beber-levar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: add-order-backdrop-fade-in 0.2s ease forwards;
  }

  @keyframes add-order-backdrop-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .add-order-beber-levar-popover {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1002;
    transform: translate(-50%, -50%);
    padding: 1.25rem;
    min-width: 220px;
    background: var(--bg-card);
    border: 1px solid var(--accent);
    border-radius: 8px;
    box-shadow: var(--shadow-hover), 0 8px 24px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(12px);
    animation: add-order-popover-fade-in 0.25s ease forwards;
  }

  @keyframes add-order-popover-fade-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .add-order-beber-levar-popover .add-order-beber-levar-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.5rem;
  }

  .add-order-quantity-label {
    margin-bottom: 0.75rem;
  }

  .add-order-quantity-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .add-order-quantity-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text);
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  .add-order-quantity-btn:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
    color: var(--accent);
  }

  .add-order-quantity-value {
    min-width: 2rem;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
    text-align: center;
  }

  .add-order-quantity-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .add-order-quantity-add-btn {
    background: var(--accent);
    color: #fff;
  }

  .add-order-quantity-add-btn:hover {
    background: var(--accent-light);
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btn {
    padding: 0.55rem 1rem;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition);
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btn--beber {
    background: #1b5e20;
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btn--beber:hover {
    background: #2e7d32;
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btn--levar {
    background: #388e3c;
  }

  .add-order-beber-levar-popover .add-order-beber-levar-btn--levar:hover {
    background: #43a047;
  }

  .add-order-beber-levar-popover .add-order-beber-levar-cancel {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition), color var(--transition);
  }

  .add-order-beber-levar-popover .add-order-beber-levar-cancel:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .add-order-beber-levar-popover .add-order-beber-levar-cancel:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .add-order-custom-product-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    border: 2px solid rgba(0, 0, 0, 0.22);
    border-radius: 9999px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
  }

  .add-order-custom-product-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .add-order-custom-product-backdrop {
    position: absolute;
    inset: 0;
    z-index: 1001;
  }

  .add-order-custom-product-popover {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 1002;
    transform: translate(-50%, -50%);
    min-width: 280px;
  }

  .add-order-custom-product-title {
    display: block;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.75rem;
  }

  .add-order-custom-product-popover .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .add-order-custom-product-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .add-order-footer {
    flex-shrink: 0;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .add-btn--secondary {
    background: #e0e2e5;
    color: #fff;
    border: 1px solid #c5c9ce;
  }

  .add-btn--secondary:hover {
    background: #d0d4d8;
  }

  .edit-order-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }

  .edit-order-overlay--open {
    opacity: 1;
    pointer-events: auto;
  }

  .edit-order-panel-wrap {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1001;
    max-width: calc(100vw - 3rem);
    transform: translate(-50%, -50%) scale(0.95);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  .edit-order-panel-wrap--open {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    pointer-events: auto;
  }

  .edit-order-panel-wrap .add-panel {
    position: relative;
    padding: 2rem 2.25rem;
    padding-right: 2.75rem;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover);
    border: 1px solid var(--border);
    backdrop-filter: blur(12px);
  }

  .edit-order-item-name {
    margin-bottom: 1rem;
  }

  .edit-order-item-name strong {
    font-weight: 600;
    color: var(--text);
  }

  .edit-order-qty-wrap {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    overflow: hidden;
    width: fit-content;
  }

  .edit-order-qty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    flex-shrink: 0;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .edit-order-qty-btn:hover {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .edit-order-qty-input {
    width: 3.5rem;
    text-align: center;
    border: none;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    border-radius: 0;
    -moz-appearance: textfield;
  }

  .edit-order-qty-input::-webkit-outer-spin-button,
  .edit-order-qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .edit-order-price-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    min-height: 2.75rem;
    width: fit-content;
    max-width: 12rem;
  }

  .edit-order-price-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .edit-order-currency {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .edit-order-price-input {
    width: 5.5rem;
    min-width: 0;
    border: none;
    padding: 0.6rem 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .edit-order-price-input:focus {
    outline: none;
    box-shadow: none;
  }

  .edit-order-total-line {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-muted);
  }

  .edit-order-total-line strong {
    color: var(--accent);
    font-size: 1.05rem;
  }

  .edit-order-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .edit-order-actions-right {
    display: flex;
    gap: 0.5rem;
  }

  .edit-order-btn-remove {
    background: #b71c1c;
    color: #fff;
  }

  .edit-order-btn-remove:hover {
    background: #8b0000;
  }

  .edit-order-actions .edit-order-btn-cancel {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .edit-order-actions .edit-order-btn-cancel:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .edit-order-actions .edit-order-btn-cancel:focus-visible {
    outline: none;
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .edit-order-btn-save {
    background: #2e7d32;
    color: #fff;
  }

  .edit-order-btn-save:hover {
    background: #1b5e20;
  }

  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1002;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    animation: add-order-backdrop-fade-in 0.2s ease forwards;
  }

  .confirm-panel-wrap {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1003;
    transform: translate(-50%, -50%);
    max-width: calc(100vw - 3rem);
    animation: add-order-popover-fade-in 0.25s ease forwards;
  }

  .confirm-panel {
    padding: 1.5rem 1.75rem;
    min-width: 280px;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover), 0 8px 24px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border);
    backdrop-filter: blur(12px);
  }

  .confirm-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem 0;
  }

  .confirm-desc {
    font-size: 0.95rem;
    color: var(--text-muted);
    margin: 0 0 1.25rem 0;
    line-height: 1.45;
  }

  .confirm-desc strong {
    color: var(--text);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .confirm-actions .confirm-btn-cancel {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .confirm-actions .confirm-btn-cancel:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .confirm-actions .confirm-btn-cancel:focus-visible {
    outline: none;
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .confirm-btn-remove {
    background: #b71c1c;
    color: #fff;
  }

  .confirm-btn-remove:hover {
    background: #8b0000;
  }

  .close-account-overlay {
    position: fixed;
    inset: 0;
    z-index: 1002;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }

  .close-account-overlay--open {
    opacity: 1;
    pointer-events: auto;
  }

  .close-account-overlay--exiting {
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }

  .close-account-panel-wrap {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1003;
    max-width: min(92vw, 380px);
    transform: translate(-50%, -50%) scale(0.95);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  .relatorio-panel-wrap {
    max-width: min(95vw, 520px);
  }

  .close-account-panel-wrap--open {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    pointer-events: auto;
  }

  .close-account-panel-wrap--exiting {
    transform: translate(-50%, -120%) scale(0.2);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
  }

  .close-account-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    overflow: hidden;
    padding: 2rem 2.25rem;
    padding-right: 2.75rem;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover), 0 8px 24px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border);
    backdrop-filter: blur(12px);
  }

  .close-account-panel > .add-panel-close,
  .close-account-panel > .add-title,
  .close-account-panel > .add-desc,
  .close-account-panel > .close-account-total,
  .close-account-panel > .close-account-label,
  .close-account-panel > .close-account-methods,
  .close-account-panel > .close-account-actions {
    flex-shrink: 0;
  }

  .relatorio-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .relatorio-options .close-account-method-btn {
    width: 100%;
    justify-content: center;
  }

  .relatorio-periodo-options {
    flex-direction: row;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .relatorio-periodo-options .close-account-method-btn {
    width: auto;
    flex: 1;
    min-width: 0;
    font-size: 0.75rem;
    padding: 0.35rem 0.5rem;
  }

  .close-account-summary-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -0.25rem 0 0;
    padding-right: 0.25rem;
  }

  .close-account-subtitle {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .close-account-total {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: var(--text-muted);
  }

  .close-account-total strong {
    color: var(--accent);
    font-size: 1.25rem;
  }

  .close-account-summary {
    list-style: none;
    margin: 0 0 1.25rem 0;
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .close-account-summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
  }

  .close-account-summary-desc {
    color: var(--text);
  }

  .close-account-summary-amount {
    font-weight: 600;
    color: var(--accent);
  }

  .close-account-label {
    margin-bottom: 0.5rem;
  }

  .close-account-methods {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }

  .close-account-panel-wrap .close-account-method-btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
  }

  .close-account-panel-wrap .close-account-method-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .close-account-panel-wrap .close-account-method-btn--selected {
    background: #1b5e20;
    border-color: #1b5e20;
    color: #fff;
  }

  .close-account-panel-wrap .close-account-method-btn--selected:hover {
    background: #2e7d32;
    border-color: #2e7d32;
    color: #fff;
  }

  .close-account-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .close-account-confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .close-account-actions .close-account-cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .close-account-actions .close-account-cancel-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .close-account-actions .close-account-cancel-btn:focus-visible {
    outline: none;
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  @media (max-width: 640px) {
    .add-panel-wrap.add-panel-wrap--order {
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      transform: none;
      border-radius: 0;
    }
    .add-panel-wrap.add-panel-wrap--order.add-panel-wrap--open {
      transform: none;
    }
    .add-panel-wrap--order .add-panel--order {
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }
    .add-panel-wrap.add-panel-wrap--order .add-panel {
      border-radius: 0;
    }
    .close-account-panel-wrap {
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      transform: none;
      border-radius: 0;
    }
    .close-account-panel-wrap--open {
      transform: none;
    }
    .close-account-panel {
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }
    .close-account-panel-wrap .add-panel {
      border-radius: 0;
    }
  }

  .historico-card-payment {
    color: var(--accent);
    font-weight: 500;
  }

  .historico-total-by-method {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 2;
  }

  .historico-total-by-method-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.2rem;
  }

  .historico-total-by-method-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent);
  }

  .produtos-workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-bottom: 0.5rem;
  }

  .produtos-actions {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding-bottom: 1rem;
  }

  .produtos-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition), color var(--transition), border-color var(--transition);
    border: 1px solid transparent;
  }

  .produtos-btn--primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .produtos-btn--primary:hover:not(:disabled) {
    background: var(--accent-light);
    border-color: var(--accent-light);
  }

  .produtos-btn--secondary {
    background: var(--bg-card);
    color: var(--accent);
    border-color: var(--border);
  }

  .produtos-btn--secondary:hover:not(:disabled) {
    background: var(--accent-muted);
    border-color: var(--accent);
  }

  .produtos-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .produtos-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    grid-auto-rows: 20px;
    grid-auto-flow: dense;
    gap: 1rem;
    align-content: start;
    align-items: start;
  }

  .produtos-empty {
    grid-column: 1 / -1;
    font-size: 0.95rem;
    color: var(--text-muted);
    margin: 0;
  }

  .produtos-category-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    overflow: hidden;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .produtos-category-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: rgba(96, 165, 250, 0.35);
  }

  .produtos-category-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .produtos-category-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .produtos-add-item-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-card);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition), border-color var(--transition);
  }

  .produtos-add-item-btn:hover {
    background: var(--accent-muted);
    border-color: var(--accent);
  }

  .produtos-items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.5rem 1rem 0.75rem;
  }

  .produtos-item-empty {
    font-size: 0.875rem;
    color: var(--text-muted);
    padding: 0.5rem 0;
    margin: 0;
  }

  .produtos-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .produtos-item:last-child {
    border-bottom: none;
  }

  .produtos-item-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .produtos-item-name {
    color: var(--text);
    font-weight: 500;
  }

  .produtos-item-prices {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .produtos-item-edit {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .produtos-item-edit:hover {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .produtos-price-mode {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .produtos-mode-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }

  .produtos-mode-btn:hover {
    background: var(--accent-muted);
    border-color: var(--accent);
    color: var(--accent);
  }

  .produtos-mode-btn--active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .add-panel--product-form .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .produtos-delete-btn {
    margin-top: 0.5rem;
  }

  .add-panel-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, color 0.2s;
  }

  .add-panel-close:hover {
    background: var(--border);
    color: var(--text);
  }

  .add-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.35rem;
  }

  .add-title svg { color: var(--accent); flex-shrink: 0; }

  .add-title--client {
    font-family: Georgia, 'Times New Roman', serif;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .add-desc {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-bottom: 1.25rem;
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .add-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
  }

  .add-input,
  .add-select {
    padding: 0.7rem 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95rem;
    background: var(--bg);
    color: var(--text);
    transition: border-color var(--transition), box-shadow var(--transition);
  }

  .add-input::placeholder { color: var(--text-muted); }
  .add-input:hover,
  .add-select:hover { border-color: rgba(0,0,0,0.15); }
  .add-input:focus,
  .add-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .price-input-wrap {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    overflow: hidden;
  }

  .price-input-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .price-input-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    flex-shrink: 0;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .price-input-btn:hover {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .price-input-btn:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .price-input-wrap .price-input {
    flex: 1;
    min-width: 0;
    border: none;
    border-radius: 0;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    text-align: center;
  }

  .price-input-wrap .price-input:focus {
    box-shadow: none;
  }

  .add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.35rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background var(--transition), color var(--transition), border-color var(--transition), transform 0.1s ease;
    margin-top: 0.25rem;
  }

  .add-btn--primary {
    background: var(--accent);
    color: #fff;
  }

  .add-btn--primary:hover {
    background: var(--accent-light);
  }

  .add-btn:active { transform: scale(0.98); }
  .add-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .footer {
    flex-shrink: 0;
    margin-top: auto;
    padding: 0.85rem 2rem;
    border-top: 1px solid var(--border);
    background: var(--bg-header);
    text-align: center;
    backdrop-filter: blur(8px);
  }

  .footer-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    letter-spacing: 0.01em;
    line-height: 1.4;
    margin: 0;
  }

  .footer-link {
    color: var(--accent);
    text-decoration: none;
  }

  .footer-link:hover {
    text-decoration: underline;
  }

  .toast-stack {
    position: fixed;
    left: 50%;
    top: 35%;
    transform: translate(-50%, -50%);
    z-index: 1100;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .toast-stack .toast {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    flex-shrink: 0;
    animation: toast-stack-in 0.35s ease forwards;
  }

  .toast-stack .toast--exiting {
    animation: toast-stack-out 0.3s ease forwards;
  }

  @keyframes toast-stack-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes toast-stack-out {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  .toast {
    position: fixed;
    left: 50%;
    top: 35%;
    transform: translate(-50%, -50%);
    padding: 0.75rem 1.25rem;
    background: var(--accent);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    z-index: 1100;
    pointer-events: none;
    animation: toast-in 0.35s ease forwards;
  }

  .toast--exiting {
    animation: toast-out 0.3s ease forwards;
  }

  .toast--remove {
    background: #b71c1c;
  }

  .toast-message {
    display: block;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @keyframes toast-out {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
  }

  @media (min-width: 1024px) {
    .main { padding: 2rem 2rem 4rem; }
    .workspace-grid { gap: 1.5rem; }
  }
`
