import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { pruneUnusedFiles } from './cleanup.js'

/**
 * Чистка тел картинок.
 *
 * Опасность здесь односторонняя: лишний оставленный файл — это несколько
 * килобайт, а лишний удалённый — картинка, пропавшая у всех навсегда.
 * Поэтому больше всего проверок на то, что файл НЕ удаляется: у копии
 * элемента тот же `fileId`, и достаточно одной живой ссылки.
 */

interface Element {
  isDeleted?: boolean
  fileId?: string
}

function docWith(elements: Record<string, Element>, files: Record<string, string>): Y.Doc {
  const doc = new Y.Doc()
  doc.transact(() => {
    const elementMap = doc.getMap('elements')
    Object.entries(elements).forEach(([id, element]) => elementMap.set(id, element))
    const fileMap = doc.getMap('files')
    Object.entries(files).forEach(([id, body]) => fileMap.set(id, body))
  })
  return doc
}

const fileIds = (doc: Y.Doc) => [...doc.getMap('files').keys()].sort()
const elementIds = (doc: Y.Doc) => [...doc.getMap('elements').keys()].sort()

describe('что остаётся', () => {
  it('файл живой картинки не трогает', () => {
    const doc = docWith({ e1: { fileId: 'f1' } }, { f1: 'данные' })

    expect(pruneUnusedFiles(doc)).toBe(0)
    expect(fileIds(doc)).toEqual(['f1'])
  })

  it('файл, на который ссылается копия элемента, остаётся', () => {
    // Один и тот же fileId делят копии: удалили одну — вторая ещё показывает
    const doc = docWith(
      { e1: { fileId: 'f1', isDeleted: true }, e2: { fileId: 'f1' } },
      { f1: 'данные' },
    )

    expect(pruneUnusedFiles(doc)).toBe(0)
    expect(fileIds(doc)).toEqual(['f1'])
  })

  it('живая ссылка спасает файл, даже если удалённых копий много', () => {
    const doc = docWith(
      {
        e1: { fileId: 'f1', isDeleted: true },
        e2: { fileId: 'f1', isDeleted: true },
        e3: { fileId: 'f1', isDeleted: true },
        e4: { fileId: 'f1' },
      },
      { f1: 'данные' },
    )

    expect(pruneUnusedFiles(doc)).toBe(0)
    expect(fileIds(doc)).toEqual(['f1'])
  })

  it('сами удалённые элементы остаются в документе', () => {
    // Тень удалённого — небольшой JSON, а вычистка может воскресить элемент
    // у клиента, который переподключится со старой копией
    const doc = docWith({ e1: { fileId: 'f1', isDeleted: true } }, { f1: 'данные' })

    pruneUnusedFiles(doc)

    expect(elementIds(doc)).toEqual(['e1'])
  })

  it('элементы без картинок никому не мешают', () => {
    const doc = docWith({ e1: {}, e2: { fileId: 'f1' } }, { f1: 'данные' })

    expect(pruneUnusedFiles(doc)).toBe(0)
  })
})

describe('что уходит', () => {
  it('файл единственной удалённой картинки', () => {
    const doc = docWith({ e1: { fileId: 'f1', isDeleted: true } }, { f1: 'данные' })

    expect(pruneUnusedFiles(doc)).toBe(1)
    expect(fileIds(doc)).toEqual([])
  })

  it('файл, на который вообще нет ссылок', () => {
    const doc = docWith({ e1: { fileId: 'f1' } }, { f1: 'данные', f2: 'осиротевшие данные' })

    expect(pruneUnusedFiles(doc)).toBe(1)
    expect(fileIds(doc)).toEqual(['f1'])
  })

  it('несколько сразу, и счётчик их считает', () => {
    const doc = docWith(
      { e1: { fileId: 'f1' }, e2: { fileId: 'f2', isDeleted: true } },
      { f1: 'живые', f2: 'мёртвые', f3: 'ничьи', f4: 'тоже ничьи' },
    )

    expect(pruneUnusedFiles(doc)).toBe(3)
    expect(fileIds(doc)).toEqual(['f1'])
  })
})

describe('вырожденные случаи', () => {
  it('пустой документ', () => {
    expect(pruneUnusedFiles(new Y.Doc())).toBe(0)
  })

  it('картинки есть, элементов нет — уходят все', () => {
    const doc = docWith({}, { f1: 'данные', f2: 'данные' })

    expect(pruneUnusedFiles(doc)).toBe(2)
    expect(fileIds(doc)).toEqual([])
  })

  it('элементы есть, картинок нет', () => {
    const doc = docWith({ e1: { fileId: 'f1' } }, {})

    expect(pruneUnusedFiles(doc)).toBe(0)
  })

  it('повторный вызов ничего не меняет', () => {
    const doc = docWith({ e1: { fileId: 'f1', isDeleted: true } }, { f1: 'данные' })

    expect(pruneUnusedFiles(doc)).toBe(1)
    expect(pruneUnusedFiles(doc)).toBe(0)
  })
})

describe('как удаляет', () => {
  it('одной транзакцией, а не по файлу за раз', () => {
    // Каждая транзакция — это обновление, разосланное всем подключённым
    const doc = docWith({}, { f1: 'a', f2: 'b', f3: 'c' })
    let transactions = 0
    doc.on('afterTransaction', () => { transactions += 1 })

    pruneUnusedFiles(doc)

    expect(transactions).toBe(1)
  })

  it('состояние документа после чистки становится меньше', () => {
    const doc = docWith({ e1: { fileId: 'f1' } }, { f1: 'малые данные', f2: 'x'.repeat(5000) })
    const before = Y.encodeStateAsUpdate(doc).length

    pruneUnusedFiles(doc)

    expect(Y.encodeStateAsUpdate(doc).length).toBeLessThan(before)
  })

  it('пустой документ не трогает вовсе', () => {
    const doc = new Y.Doc()
    let transactions = 0
    doc.on('afterTransaction', () => { transactions += 1 })

    pruneUnusedFiles(doc)

    expect(transactions).toBe(0)
  })
})
