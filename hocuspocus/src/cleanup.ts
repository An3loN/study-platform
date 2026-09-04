import * as Y from 'yjs'

/** Элемент сцены Excalidraw в том виде, в каком он лежит в документе */
type StoredElement = { isDeleted?: boolean; fileId?: string }

/**
 * Выбрасывает из документа тела картинок, на которые больше никто не ссылается.
 * Возвращает количество удалённых файлов.
 *
 * Момент вызова важнее самой чистки. Удалять файл сразу, как удалили картинку,
 * нельзя: Ctrl+Z вернёт элемент, а тела уже не будет; один и тот же fileId
 * делят копии элемента; отставший участник может всё ещё на него ссылаться.
 * Поэтому чистим в onStoreDocument — там от комнаты отключился последний
 * клиент, никто не редактирует и стека undo ни у кого не осталось.
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
