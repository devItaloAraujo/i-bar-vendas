import Dexie, { type EntityTable } from 'dexie'
import { menu as defaultMenu } from './data/menu'

// --- Schema types ---
export interface CategoryRow {
  id: string
  name: string
  sortOrder: number
}

export interface MenuItemRow {
  id: string
  categoryId: string
  name: string
  price?: number
  priceDrink?: number
  priceTakeaway?: number
}

export interface TableRow {
  id: string
  name: string
}

export interface TableOrderRow {
  id: string
  tableId: string
  description: string
  amount: number
  date: string
}

export interface HistoryEntryRow {
  id: string
  clientName: string
  paidAt: string
  paymentMethod?: string
}

export interface HistoryOrderRow {
  id: string
  historyId: string
  description: string
  amount: number
  date: string
}

// --- App-facing types (same as App.tsx) ---
export interface Order {
  id: string
  description: string
  amount: number
  date: string
}

export interface Table {
  id: string
  name: string
  orders: Order[]
}

export interface HistoryEntry {
  id: string
  clientName: string
  orders: Order[]
  paidAt: string
  paymentMethod?: string
}

export interface MenuCategory {
  category: string
  items: Array<{
    name: string
    price?: number
    priceDrink?: number
    priceTakeaway?: number
  }>
}

// --- Dexie DB ---
export class IBarDb extends Dexie {
  categories!: EntityTable<CategoryRow, 'id'>
  menuItems!: EntityTable<MenuItemRow, 'id'>
  activeTables!: EntityTable<TableRow, 'id'>
  tableOrders!: EntityTable<TableOrderRow, 'id'>
  historyEntries!: EntityTable<HistoryEntryRow, 'id'>
  historyOrders!: EntityTable<HistoryOrderRow, 'id'>

  constructor() {
    super('iBarVendas')
    this.version(1).stores({
      categories: 'id, sortOrder',
      menuItems: 'id, categoryId',
      activeTables: 'id',
      tableOrders: 'id, tableId, date',
      historyEntries: 'id, paidAt',
      historyOrders: 'id, historyId',
    })
  }
}

export const db = new IBarDb()

const SEEDED_KEY = 'iBarVendas_seeded_v3'

let seedingPromise: Promise<void> | null = null

/** Remove duplicate categories (same name): keep one, merge items into it, delete duplicates. Then remove duplicate menu items (same categoryId + name). */
async function deduplicateCategories(): Promise<void> {
  const categories = await db.categories.orderBy('sortOrder').toArray()
  const byName = new Map<string, CategoryRow[]>()
  for (const c of categories) {
    const list = byName.get(c.name) ?? []
    list.push(c)
    byName.set(c.name, list)
  }
  for (const [, list] of byName) {
    if (list.length <= 1) continue
    list.sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id.localeCompare(b.id))
    const [keep, ...dupes] = list
    for (const dup of dupes) {
      const items = await db.menuItems.where('categoryId').equals(dup.id).toArray()
      for (const item of items) {
        await db.menuItems.update(item.id, { categoryId: keep.id } as Partial<MenuItemRow>)
      }
      await db.categories.delete(dup.id)
    }
  }
  // Dedupe menu items by (categoryId, name): keep first, delete rest
  const allItems = await db.menuItems.toArray()
  const seen = new Map<string, string>()
  for (const item of allItems) {
    const key = `${item.categoryId}\0${item.name}`
    const existingId = seen.get(key)
    if (existingId != null) await db.menuItems.delete(item.id)
    else seen.set(key, item.id)
  }
}

async function seedIfNeeded(): Promise<void> {
  // Prevent concurrent seeding
  if (seedingPromise) return seedingPromise
  
  // Check localStorage flag first (fast path)
  const seeded = localStorage.getItem(SEEDED_KEY)
  if (seeded === '1') {
    const categoryCount = await db.categories.count()
    const itemCount = await db.menuItems.count()
    if (categoryCount > 0 && itemCount > 0) {
      await deduplicateCategories()
      return
    }
  }
  
  // Need to seed - use a promise to prevent race conditions
  seedingPromise = (async () => {
    // Clear any existing data to prevent duplicates
    await db.categories.clear()
    await db.menuItems.clear()
    
    let sortOrder = 0
    for (const cat of defaultMenu.menu) {
      const categoryId = crypto.randomUUID()
      await db.categories.add({
        id: categoryId,
        name: cat.category,
        sortOrder: sortOrder++,
      })
      for (const item of cat.items) {
        const row: MenuItemRow = {
          id: crypto.randomUUID(),
          categoryId,
          name: item.name,
        }
        if ('price' in item && item.price != null) row.price = item.price
        if ('priceDrink' in item && item.priceDrink != null) row.priceDrink = item.priceDrink
        if ('priceTakeaway' in item && item.priceTakeaway != null) row.priceTakeaway = item.priceTakeaway
        await db.menuItems.add(row)
      }
    }
    await deduplicateCategories()
    localStorage.setItem(SEEDED_KEY, '1')
  })()
  
  return seedingPromise
}

// --- Menu (read) ---
export async function getMenu(): Promise<MenuCategory[]> {
  await seedIfNeeded()
  const categories = await db.categories.orderBy('sortOrder').toArray()
  const menu: MenuCategory[] = []
  for (const cat of categories) {
    const items = await db.menuItems.where('categoryId').equals(cat.id).toArray()
    menu.push({
      category: cat.name,
      items: items.map((i) => {
        const o: { name: string; price?: number; priceDrink?: number; priceTakeaway?: number } = { name: i.name }
        if (i.price != null) o.price = i.price
        if (i.priceDrink != null) o.priceDrink = i.priceDrink
        if (i.priceTakeaway != null) o.priceTakeaway = i.priceTakeaway
        return o
      }),
    })
  }
  return menu
}

// --- Categories + menu items (for Produtos tab) ---
export interface CategoryWithItems {
  id: string
  name: string
  sortOrder: number
  items: MenuItemRow[]
}

export async function getCategoriesWithItems(): Promise<CategoryWithItems[]> {
  await seedIfNeeded()
  const categories = await db.categories.orderBy('sortOrder').toArray()
  const result: CategoryWithItems[] = []
  for (const cat of categories) {
    const items = await db.menuItems.where('categoryId').equals(cat.id).toArray()
    result.push({ ...cat, items })
  }
  return result
}

export async function addCategory(name: string): Promise<CategoryRow> {
  const trimmed = name.trim()
  const existing = await db.categories.filter((c) => c.name === trimmed).first()
  if (existing != null) return existing
  const categories = await db.categories.orderBy('sortOrder').toArray()
  const sortOrder = categories.length
  const id = crypto.randomUUID()
  await db.categories.add({ id, name: trimmed, sortOrder })
  return { id, name: trimmed, sortOrder }
}

export async function updateCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name: name.trim() })
}

export async function addMenuItem(
  categoryId: string,
  item: { name: string; price?: number; priceDrink?: number; priceTakeaway?: number }
): Promise<MenuItemRow> {
  const id = crypto.randomUUID()
  const row: MenuItemRow = { id, categoryId, name: item.name.trim() }
  if (item.price != null) row.price = item.price
  if (item.priceDrink != null) row.priceDrink = item.priceDrink
  if (item.priceTakeaway != null) row.priceTakeaway = item.priceTakeaway
  await db.menuItems.add(row)
  return row
}

export async function updateMenuItem(
  id: string,
  updates: { name?: string; price?: number; priceDrink?: number | null; priceTakeaway?: number | null }
): Promise<void> {
  const row = await db.menuItems.get(id)
  if (!row) return
  if (updates.name != null) row.name = updates.name.trim()
  if (updates.price !== undefined) row.price = updates.price
  if (updates.priceDrink !== undefined) {
    if (updates.priceDrink === null) delete (row as Partial<MenuItemRow>).priceDrink
    else row.priceDrink = updates.priceDrink
  }
  if (updates.priceTakeaway !== undefined) {
    if (updates.priceTakeaway === null) delete (row as Partial<MenuItemRow>).priceTakeaway
    else row.priceTakeaway = updates.priceTakeaway
  }
  await db.menuItems.put(row)
}

export async function deleteMenuItem(id: string): Promise<void> {
  await db.menuItems.delete(id)
}

export async function getCategoryItemCount(categoryId: string): Promise<number> {
  return db.menuItems.where('categoryId').equals(categoryId).count()
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
}

// --- Tables + orders ---
export async function getTables(): Promise<Table[]> {
  const tableRows = await db.activeTables.toArray()
  const result: Table[] = []
  for (const t of tableRows) {
    const orderRows = await db.tableOrders.where('tableId').equals(t.id).toArray()
    result.push({
      id: t.id,
      name: t.name,
      orders: orderRows.map((o) => ({
        id: o.id,
        description: o.description,
        amount: o.amount,
        date: o.date,
      })),
    })
  }
  return result
}

export async function addTable(name: string): Promise<Table> {
  const id = crypto.randomUUID()
  await db.activeTables.add({ id, name })
  return { id, name, orders: [] }
}

export async function updateTable(tableId: string, updates: { name?: string }): Promise<void> {
  const row = await db.activeTables.get(tableId)
  if (!row) return
  if (updates.name != null) row.name = updates.name
  await db.activeTables.put(row)
}

export async function deleteTable(tableId: string): Promise<void> {
  await db.tableOrders.where('tableId').equals(tableId).delete()
  await db.activeTables.delete(tableId)
}

export async function addTableOrder(tableId: string, order: Omit<Order, 'id'>): Promise<Order> {
  const id = crypto.randomUUID()
  await db.tableOrders.add({
    id,
    tableId,
    description: order.description,
    amount: order.amount,
    date: order.date,
  })
  return { id, ...order }
}

export async function updateTableOrder(
  tableId: string,
  orderId: string,
  updates: { description?: string; amount?: number }
): Promise<void> {
  const row = await db.tableOrders.get(orderId)
  if (!row || row.tableId !== tableId) return
  if (updates.description != null) row.description = updates.description
  if (updates.amount != null) row.amount = updates.amount
  await db.tableOrders.put(row)
}

export async function deleteTableOrder(tableId: string, orderId: string): Promise<void> {
  const row = await db.tableOrders.get(orderId)
  if (row && row.tableId === tableId) await db.tableOrders.delete(orderId)
}

// --- History ---
export async function getHistory(): Promise<HistoryEntry[]> {
  const entries = await db.historyEntries.orderBy('paidAt').reverse().toArray()
  const result: HistoryEntry[] = []
  for (const e of entries) {
    const orderRows = await db.historyOrders.where('historyId').equals(e.id).toArray()
    result.push({
      id: e.id,
      clientName: e.clientName,
      paidAt: e.paidAt,
      paymentMethod: e.paymentMethod,
      orders: orderRows.map((o) => ({
        id: o.id,
        description: o.description,
        amount: o.amount,
        date: o.date,
      })),
    })
  }
  return result
}

export async function addHistoryEntry(entry: {
  clientName: string
  paidAt: string
  paymentMethod?: string
  orders: Order[]
}): Promise<HistoryEntry> {
  const id = crypto.randomUUID()
  await db.historyEntries.add({
    id,
    clientName: entry.clientName,
    paidAt: entry.paidAt,
    paymentMethod: entry.paymentMethod,
  })
  for (const o of entry.orders) {
    await db.historyOrders.add({
      id: o.id,
      historyId: id,
      description: o.description,
      amount: o.amount,
      date: o.date,
    })
  }
  return {
    id,
    clientName: entry.clientName,
    paidAt: entry.paidAt,
    paymentMethod: entry.paymentMethod,
    orders: entry.orders,
  }
}

export async function closeTableAndAddToHistory(
  tableId: string,
  table: Table,
  paymentMethod: string
): Promise<HistoryEntry> {
  const entry = await addHistoryEntry({
    clientName: table.name,
    paidAt: new Date().toISOString(),
    paymentMethod,
    orders: table.orders,
  })
  await deleteTable(tableId)
  return entry
}
