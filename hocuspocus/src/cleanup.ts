import * as Y from 'yjs'

/** Элемент сцены Excalidraw в том виде, в каком он лежит в документе */
type StoredElement = { isDeleted?: boolean; fileId?: string }

/** Документ Hocuspocus: Y.Doc, который знает, сколько к нему подключено */
export type RoomDocument = Y.Doc & { getConnectionsCount(): number }

/**
 * Чистит тела картинок, только если в комнате никого нет. Возвращает
 * количество удалённых файлов.
 *
 * Проверка здесь, а не в том, откуда зовут: `onStoreDocument` срабатывает не
 * только когда ушёл последний клиент, но и через 5–30 секунд после каждой
 * правки посреди урока (debounce, см. server.ts). Без неё удалённая картинка
 * теряла тело через пару секунд, и Ctrl+Z возвращал пустую рамку.
 */
export function pruneUnusedFilesIfIdle(document: RoomDocument): number {
  if (document.getConnectionsCount() > 0) return 0
  return pruneUnusedFiles(document)
}

/**
 * Выбрасывает из документа тела картинок, на которые больше никто не ссылается.
 * Возвращает количество удалённых файлов.
 *
 * Момент вызова важнее самой чистки. Удалять файл сразу, как удалили картинку,
 * нельзя: Ctrl+Z вернёт элемент, а тела уже не будет; один и тот же fileId
 * делят копии элемента; отставший участник может всё ещё на него ссылаться.
 * Поэтому чистим только в пустой комнате (см. pruneUnusedFilesIfIdle) —
 * никто не редактирует и стека undo ни у кого не осталось.
 *
 * Сами удалённые элементы не трогаем: это небольшой JSON, а вычистка тени
 * может воскресить её у клиента, который переподключится со старой копией.
 */
export function pruneUnusedFiles(document: Y.Doc): number {
  const files = document.getMap('files')
  if (files.size === 0) return 0

  const used = new Set<string>()
  document.getMap('elements').forEach((value) => {
    const element = value as StoredElement
    if (!element.isDeleted && element.fileId) used.add(element.fileId)
  })

  const orphans: string[] = []
  files.forEach((_value, fileId) => {
    if (!used.has(fileId)) orphans.push(fileId)
  })
  if (orphans.length === 0) return 0

  document.transact(() => {
    orphans.forEach((fileId) => files.delete(fileId))
  })
  return orphans.length
}
