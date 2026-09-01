import { useEffect, useRef, useState, useCallback } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
  BinaryFiles,
} from '@excalidraw/excalidraw/types/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'

interface Props {
  roomId: string
  accessToken: string
  readonly?: boolean
}

type SyncStatus = 'connecting' | 'connected' | 'disconnected' | 'forbidden'

const STATUS_LABEL: Record<SyncStatus, string> = {
  connecting: 'Подключение...',
  connected: 'Синхронизировано',
  disconnected: 'Нет соединения',
  forbidden: 'Нет доступа к доске',
}
const STATUS_COLOR: Record<SyncStatus, string> = {
  connecting: '#fb8c00',
  connected: '#43a047',
  disconnected: '#e53935',
  forbidden: '#e53935',
}

// Шаг сетки на фоне доски
const GRID_SIZE = 20

// Как часто отправлять изменения. Excalidraw дёргает onChange на каждую точку
// штриха, а каждое изменение — это полный снимок элемента, поэтому шлём пачками.
const SYNC_INTERVAL_MS = 50

/**
 * Адрес Hocuspocus за nginx: тот же хост, что и страница, путь /board.
 * Имя документа (roomId) Hocuspocus получает не из URL, а из своего протокола.
 */
function boardUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/board`
}

export function WhiteboardRoom({ roomId, accessToken, readonly = false }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const yElementsRef = useRef<Y.Map<unknown> | null>(null)
  const yFilesRef = useRef<Y.Map<unknown> | null>(null)
  const isRemoteUpdateRef = useRef(false)

  /**
   * Версии элементов, которые уже уехали в Yjs.
   *
   * Сравнивать с yElements.get(id) нельзя: Y.Map хранит ссылку на тот же объект,
   * который Excalidraw мутирует на месте (точки кисти, размеры, позиция), поэтому
   * "старая" версия всегда равна новой и изменение выглядит как отсутствие изменений.
   * Из-за этого партнёру уезжал только момент создания элемента — точка начала штриха.
   */
  const sentVersionsRef = useRef<Map<string, number>>(new Map())

  // Файлы, уже отданные Excalidraw через addFiles
  const addedFilesRef = useRef<Set<string>>(new Set())

  // Последнее состояние сцены, ожидающее отправки (см. SYNC_INTERVAL_MS)
  const pendingRef = useRef<{ elements: readonly ExcalidrawElement[]; files: BinaryFiles } | null>(null)
  const flushTimerRef = useRef<number | null>(null)

  const [status, setStatus] = useState<SyncStatus>('connecting')

  // Yjs -> Excalidraw
  const applyRemoteState = useCallback(() => {
    const api = apiRef.current
    const yElements = yElementsRef.current
    const yFiles = yFilesRef.current
    if (!api || !yElements || !yFiles) return

    const stored = yFiles.toJSON() as Record<string, BinaryFileData>

    /**
     * Сцена = локальные элементы, поверх которых легли более свежие удалённые.
     *
     * Заменять сцену целиком нельзя: пока чужое изменение едет к нам, у нас
     * может рисоваться свой элемент, которого в документе ещё нет — при замене
     * он бы пропал прямо под курсором. Побеждает больший version, при равенстве —
     * меньший versionNonce (так же разрешает ничью сам Excalidraw).
     */
    const merged = new Map<string, ExcalidrawElement>()
    api.getSceneElementsIncludingDeleted().forEach((el) => merged.set(el.id, el))

    ;(Array.from(yElements.values()) as ExcalidrawElement[]).forEach((remote) => {
      const local = merged.get(remote.id)
      const remoteWins = !local
        || remote.version > local.version
        || (remote.version === local.version && remote.versionNonce < local.versionNonce)
      if (!remoteWins) return

      // Пришедшие версии считаем уже синхронизированными, иначе onChange
      // отправит их обратно на сервер по кругу
      sentVersionsRef.current.set(remote.id, remote.version)

      // Автор картинки помечает элемент как pending — у него это значит
      // "файл ещё не сохранён на бэкенде". У нас бэкенд для картинок — сам
      // документ Yjs, и раз файл в нём есть, элемент готов к отрисовке.
      // Без этого Excalidraw рисует вместо картинки пустоту.
      const fileId = (remote as { fileId?: string }).fileId
      if (remote.type === 'image' && fileId && stored[fileId] && remote.status === 'pending') {
        merged.set(remote.id, { ...remote, status: 'saved' } as ExcalidrawElement)
        return
      }
      merged.set(remote.id, remote)
    })

    const elements = Array.from(merged.values())

    isRemoteUpdateRef.current = true
    api.updateScene({ elements })
    isRemoteUpdateRef.current = false

    // Файлы отдаём строго ПОСЛЕ updateScene: addFiles обновляет кэш картинок
    // только для элементов, которые уже есть в сцене. Если позвать раньше,
    // файл в памяти окажется, а картинка так и останется нарисованной пустотой.
    const needed = new Set(
      elements
        .filter((el): el is ExcalidrawElement & { fileId: string } =>
          el.type === 'image' && Boolean((el as { fileId?: string }).fileId))
        .map((el) => el.fileId),
    )
    const missing = Object.values(stored).filter(
      (file) => needed.has(file.id) && !addedFilesRef.current.has(file.id),
    )
    if (missing.length) {
      api.addFiles(missing)
      missing.forEach((file) => addedFilesRef.current.add(file.id))
    }
  }, [])

  // Excalidraw -> Yjs (только локальные изменения)
  const flushLocalChanges = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    const { elements, files } = pending

    const ydoc = ydocRef.current
    const yElements = yElementsRef.current
    const yFiles = yFilesRef.current
    if (!ydoc || !yElements || !yFiles) return

    const sent = sentVersionsRef.current

    ydoc.transact(() => {
      // Элементы из документа, отсутствующие в нашей сцене, НЕ удаляем.
      // onChange отдаёт сцену вместе с удалёнными (isDeleted: true), поэтому
      // настоящее удаление и так уезжает как обновление элемента. А чужой
      // свежий элемент, ещё не доехавший до нас, при удалении "по отсутствию"
      // стирался бы у всех — из-за этого рисовать мог только кто-то один.

      // Обновляем изменённые (сравниваем по version)
      elements.forEach((el) => {
        if (sent.get(el.id) === el.version) return
        sent.set(el.id, el.version)
        // Снимок, а не ссылка: Excalidraw продолжит мутировать свой объект
        yElements.set(el.id, structuredClone(el))
      })

      // Картинки: тело файла неизменяемо, поэтому кладём только новые.
      // Шлём лишь те, на которые ссылается сцена — иначе Excalidraw, который
      // держит файлы удалённых картинок в памяти, будет возвращать их в документ.
      const usedFileIds = new Set(
        elements
          .filter((el) => el.type === 'image')
          .map((el) => (el as { fileId?: string }).fileId)
          .filter(Boolean),
      )
      Object.entries(files ?? {}).forEach(([fileId, file]) => {
        if (usedFileIds.has(fileId) && !yFiles.has(fileId)) {
          yFiles.set(fileId, structuredClone(file))
        }
      })
    }, ydoc.clientID)
  }, [])

  useEffect(() => {
    if (!roomId) {
      setStatus('disconnected')
      return
    }

    const ydoc = new Y.Doc()
    const yElements = ydoc.getMap<unknown>('elements')
    const yFiles = ydoc.getMap<unknown>('files')
    ydocRef.current = ydoc
    yElementsRef.current = yElements
    yFilesRef.current = yFiles
    sentVersionsRef.current = new Map()
    addedFilesRef.current = new Set()

    // Hocuspocus говорит на собственном протоколе поверх Yjs: имя документа и
    // JWT передаются его сообщениями, поэтому нужен именно HocuspocusProvider.
    const provider = new HocuspocusProvider({
      url: boardUrl(),
      name: roomId,
      token: accessToken,
      document: ydoc,
      onStatus: ({ status: s }) => {
        setStatus((prev) => (prev === 'forbidden' ? prev : (s as SyncStatus)))
      },
      onSynced: () => applyRemoteState(),
      onAuthenticationFailed: ({ reason }) => {
        console.error('[whiteboard] Доступ к комнате отклонён:', reason)
        setStatus('forbidden')
      },
    })
    providerRef.current = provider

    // Удалённые изменения -> Excalidraw
    const observer = (_event: Y.YMapEvent<unknown>, txn: Y.Transaction) => {
      if (txn.local) return
      applyRemoteState()
    }
    yElements.observe(observer)
    yFiles.observe(observer)

    return () => {
      yElements.unobserve(observer)
      yFiles.unobserve(observer)
      // Досылаем то, что не успело уехать по таймеру
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushLocalChanges()
      provider.destroy()
      ydoc.destroy()
      providerRef.current = null
      ydocRef.current = null
      yElementsRef.current = null
      yFilesRef.current = null
    }
  }, [roomId, accessToken, applyRemoteState, flushLocalChanges])

  const handleChange = useCallback((
    elements: readonly ExcalidrawElement[],
    _appState: unknown,
    files: BinaryFiles,
  ) => {
    if (isRemoteUpdateRef.current) return
    pendingRef.current = { elements, files }
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushLocalChanges()
    }, SYNC_INTERVAL_MS)
  }, [flushLocalChanges])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Статус синхронизации */}
      <div style={{
        padding: '4px 12px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: STATUS_COLOR[status],
          display: 'inline-block',
        }} />
        {STATUS_LABEL[status]}
      </div>

      {/* Excalidraw занимает оставшееся пространство */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
            // Состояние могло приехать раньше, чем Excalidraw отдал API
            applyRemoteState()
          }}
          onChange={readonly ? undefined : handleChange}
          viewModeEnabled={readonly}
          isCollaborating={status === 'connected'}
          theme="light"
          // Сетка включена по умолчанию; выключается через контекстное меню холста
          initialData={{ appState: { gridSize: GRID_SIZE } }}
        />
      </div>
    </div>
  )
}
