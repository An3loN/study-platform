import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  CollaboratorPointer,
} from '@excalidraw/excalidraw/types/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'

interface Props {
  roomId: string
  accessToken: string
  /** Имя, которое видят остальные рядом с курсором */
  username?: string
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

// Курсор и лазерный след едут через awareness, а не через документ. Реже 25 мс
// след лазера у соседа начинает рваться на отрезки.
const POINTER_INTERVAL_MS = 25

// Диапазон слайдера толщины. Встроенные значения Excalidraw — 1, 2 и 4.
const STROKE_WIDTH_MIN = 1
const STROKE_WIDTH_MAX = 12

/** Латинская буква по физической клавише: KeyV -> V */
const PHYSICAL_KEY = /^Key([A-Z])$/
const CYRILLIC_CHAR = /^[Ѐ-ӿ]$/

/**
 * Сколько после undo/redo считать приходящие изменения откатом, а не правкой.
 * Excalidraw откатывает сцену целиком и помечает всё, чего нет в снимке истории,
 * удалённым с ПОВЫШЕННОЙ версией — от обычного удаления это неотличимо.
 *
 * Отметка одноразовая: её снимает первая же отправка после undo. Поэтому срок
 * взят с большим запасом — в фоновой вкладке браузер зажимает таймеры до секунды,
 * и короткое окно истекало бы раньше, чем изменения дойдут до отправки.
 */
const UNDO_GUARD_MS = 5_000

/** Подписи кнопок отмены и повтора в тулбаре — на них тоже надо реагировать */
const UNDO_BUTTON_LABELS = ['undo', 'redo', 'отменить', 'вернуть', 'повторить']

/**
 * Цвет курсора по clientID. Шаг золотого сечения по кругу оттенков —
 * у двух подряд подключившихся заведомо разные цвета.
 */
function collaboratorColor(clientId: number): { background: string; stroke: string } {
  const hue = Math.round((clientId * 137.508) % 360)
  return { background: `hsl(${hue}, 70%, 60%)`, stroke: `hsl(${hue}, 70%, 32%)` }
}

/**
 * Адрес Hocuspocus за nginx: тот же хост, что и страница, путь /board.
 * Имя документа (roomId) Hocuspocus получает не из URL, а из своего протокола.
 */
function boardUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/board`
}

export function WhiteboardRoom({ roomId, accessToken, username, readonly = false }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const yElementsRef = useRef<Y.Map<unknown> | null>(null)
  const yFilesRef = useRef<Y.Map<unknown> | null>(null)
  const isRemoteUpdateRef = useRef(false)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)

  /**
   * Версии элементов, которые уже уехали в Yjs.
   *
   * Сравнивать с yElements.get(id) нельзя: Y.Map хранит ссылку на тот же объект,
   * который Excalidraw мутирует на месте (точки кисти, размеры, позиция), поэтому
   * "старая" версия всегда равна новой и изменение выглядит как отсутствие изменений.
   * Из-за этого партнёру уезжал только момент создания элемента — точка начала штриха.
   */
  const sentVersionsRef = useRef<Map<string, number>>(new Map())

  /**
   * Элементы, которые в документ внесли мы, — «свои». Именно внесли, а не
   * просто отправили: переслать чужой элемент можно и по касательной, и тогда
   * владельцем он не становится. Нужно, чтобы отличить свой undo от отката
   * чужого (см. flushLocalChanges).
   */
  const authoredRef = useRef<Set<string>>(new Set())

  // Файлы, уже отданные Excalidraw через addFiles
  const addedFilesRef = useRef<Set<string>>(new Set())

  // Последнее состояние сцены, ожидающее отправки (см. SYNC_INTERVAL_MS)
  const pendingRef = useRef<{ elements: readonly ExcalidrawElement[]; files: BinaryFiles } | null>(null)
  const flushTimerRef = useRef<number | null>(null)

  // Когда в последний раз отправляли позицию указателя и с какой кнопкой
  const pointerSentAtRef = useRef(0)
  const buttonSentRef = useRef<'down' | 'up'>('up')

  // Когда нажали undo/redo. 0 — отметки нет (её снимает первая же отправка)
  const undoAtRef = useRef(0)

  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [strokeWidth, setStrokeWidth] = useState(1)
  const [activeTool, setActiveTool] = useState('selection')

  /**
   * Секция «Stroke width» в левой панели Excalidraw — в неё встраивается
   * слайдер, чтобы толщина жила рядом с остальными свойствами инструмента,
   * а не в отдельной полосе над доской.
   */
  const [strokeWidthSlot, setStrokeWidthSlot] = useState<HTMLElement | null>(null)

  /**
   * Yjs -> Excalidraw.
   * `force` — идентификаторы, которые нужно взять из документа безусловно, не
   * сравнивая версии: так возвращаются чужие элементы, снесённые нашим undo.
   */
  const applyRemoteState = useCallback((force?: Set<string>) => {
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
      const remoteWins = force?.has(remote.id)
        || !local
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
    // commitToHistory: false — чужие правки не должны попадать в наш стек undo,
    // иначе Ctrl+Z откатывает не своё последнее действие, а чужое.
    api.updateScene({ elements, commitToHistory: false })
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
    const authored = authoredRef.current
    // Отметка одноразовая: снимаем её здесь, каким бы ни был исход
    const undoAt = undoAtRef.current
    undoAtRef.current = 0
    const undoing = undoAt > 0 && Date.now() - undoAt < UNDO_GUARD_MS
    const restoreForeign = new Set<string>()

    ydoc.transact(() => {
      // Элементы из документа, отсутствующие в нашей сцене, НЕ удаляем.
      // onChange отдаёт сцену вместе с удалёнными (isDeleted: true), поэтому
      // настоящее удаление и так уезжает как обновление элемента. А чужой
      // свежий элемент, ещё не доехавший до нас, при удалении "по отсутствию"
      // стирался бы у всех — из-за этого рисовать мог только кто-то один.

      // Обновляем изменённые (сравниваем по version)
      elements.forEach((el) => {
        if (sent.get(el.id) === el.version) return

        /**
         * Undo откатывает сцену целиком: всё, чего нет в снимке истории —
         * включая чужие элементы, приехавшие после нашего последнего действия, —
         * помечается удалённым, причём с повышенной версией, так что от обычного
         * удаления это неотличимо. Поэтому смотрим не на версии, а на то, был ли
         * только что undo, и трогали ли мы этот элемент сами. Чужое не публикуем:
         * иначе Ctrl+Z стирает соседу его работу.
         */
        if (undoing && !authored.has(el.id) && yElements.has(el.id)) {
          /**
           * Просто не публиковать откат мало: у нас на экране элемент уже стёрт,
           * а вернуть его копией из документа нельзя — версия в документе ниже,
           * и Excalidraw такую правку не примет, после чего наше устаревшее
           * состояние всё равно уедет всем следующей отправкой. Поэтому
           * возвращаем элемент явно, с версией заведомо старше обеих.
           */
          const remote = yElements.get(el.id) as ExcalidrawElement
          const restored = {
            ...remote,
            version: Math.max(remote.version, el.version) + 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
          } as ExcalidrawElement

          yElements.set(el.id, structuredClone(restored))
          sent.set(el.id, restored.version)
          restoreForeign.add(el.id)
          return
        }

        // Своим элемент делает только появление в документе с нашей стороны
        if (!yElements.has(el.id)) authored.add(el.id)

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

    // Чужое, что undo успел снести у нас на экране, возвращаем из документа
    if (restoreForeign.size) applyRemoteState(restoreForeign)
  }, [applyRemoteState])

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
    authoredRef.current = new Set()
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

    /**
     * Присутствие (курсоры, имена, лазерная указка) живёт в awareness, а не в
     * документе: это эфемерное состояние, его незачем сохранять в БД и
     * рассылать как правку доски.
     */
    const awareness = provider.awareness
    awareness?.setLocalStateField('user', { name: username || 'Участник' })

    /**
     * Своё присутствие в сцену не отдаём. setAwarenessField вызывается на
     * каждое движение мыши, а awareness сообщает об изменении и своего клиента:
     * без этой проверки Excalidraw получал setState на каждую точку штриха —
     * лишняя перерисовка ровно в тот момент, когда перо набирает точки.
     */
    const applyCollaborators = (changes?: { added: number[]; updated: number[]; removed: number[] }) => {
      const api = apiRef.current
      if (!api || !awareness) return

      if (changes) {
        const touched = [...changes.added, ...changes.updated, ...changes.removed]
        if (touched.length > 0 && touched.every((id) => id === awareness.clientID)) return
      }

      const collaborators = new Map<string, Collaborator>()
      awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return
        const user = state.user as { name?: string } | undefined
        collaborators.set(String(clientId), {
          id: String(clientId),
          username: user?.name || 'Участник',
          // tool: 'laser' внутри pointer заставляет Excalidraw рисовать след указки
          pointer: (state.pointer as CollaboratorPointer | undefined) ?? undefined,
          button: (state.button as 'up' | 'down' | undefined) ?? 'up',
          color: collaboratorColor(clientId),
        })
      })
      api.updateScene({ collaborators, commitToHistory: false })
    }

    awareness?.on('change', applyCollaborators)

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
      awareness?.off('change', applyCollaborators)
      // Убираем свой курсор у остальных, не дожидаясь таймаута awareness
      awareness?.setLocalState(null)
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
  }, [roomId, accessToken, username, applyRemoteState, flushLocalChanges])

  /**
   * Раскладка. Excalidraw читает event.key, поэтому на кириллице все
   * однобуквенные шорткаты (v, r, d, e, ...) и Ctrl+Z/Ctrl+A не срабатывают.
   * Подменяем событие на латинский аналог той же физической клавиши.
   */
  useEffect(() => {
    let remapping = false

    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z / Ctrl+Y — по физической клавише, чтобы не зависеть от раскладки
      if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.code === 'KeyY')) {
        undoAtRef.current = Date.now()
      }

      if (remapping || !CYRILLIC_CHAR.test(event.key)) return
      const physical = PHYSICAL_KEY.exec(event.code)
      if (!physical) return

      // В полях ввода и в текстовом редакторе доски буквы должны печататься
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const letter = physical[1]
      event.preventDefault()
      event.stopPropagation()

      remapping = true
      try {
        target?.dispatchEvent(new KeyboardEvent('keydown', {
          key: event.shiftKey ? letter : letter.toLowerCase(),
          code: event.code,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          bubbles: true,
          cancelable: true,
        }))
      } finally {
        remapping = false
      }
    }

    // Те же отмена и повтор, но кнопками в тулбаре
    const onPointerDown = (event: PointerEvent) => {
      const button = (event.target as HTMLElement | null)?.closest?.('[aria-label]')
      const label = button?.getAttribute('aria-label')?.toLowerCase()
      if (label && UNDO_BUTTON_LABELS.includes(label)) {
        undoAtRef.current = Date.now()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  /**
   * Левая панель Excalidraw появляется и исчезает вместе со сменой инструмента,
   * поэтому её секцию толщины отслеживаем наблюдателем, а не разовым поиском.
   */
  useEffect(() => {
    const root = canvasWrapRef.current
    if (!root) return

    const findSlot = () => {
      const button = root.querySelector('[data-testid^="strokeWidth-"]')
      const fieldset = (button?.closest('fieldset') as HTMLElement | null) ?? null
      setStrokeWidthSlot((prev) => (prev === fieldset ? prev : fieldset))
    }

    findSlot()
    const observer = new MutationObserver(findSlot)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  /**
   * Колесо мыши масштабирует без Ctrl. Excalidraw зумит только при ctrlKey,
   * поэтому подменяем событие на такое же, но с ctrlKey. Shift оставляем
   * горизонтальной прокрутке, Ctrl/Cmd — как было.
   */
  useEffect(() => {
    const node = canvasWrapRef.current
    if (!node) return

    let synthetic = false
    const onWheel = (event: WheelEvent) => {
      if (synthetic || event.ctrlKey || event.metaKey || event.shiftKey) return

      event.preventDefault()
      event.stopPropagation()

      synthetic = true
      try {
        event.target?.dispatchEvent(new WheelEvent('wheel', {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }))
      } finally {
        synthetic = false
      }
    }

    node.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => node.removeEventListener('wheel', onWheel, true)
  }, [])

  // Положение указателя и лазера -> awareness
  const handlePointerUpdate = useCallback((payload: {
    pointer: CollaboratorPointer
    button: 'down' | 'up'
  }) => {
    const provider = providerRef.current
    if (!provider) return

    /**
     * Смену состояния кнопки пропускаем мимо throttle. Excalidraw начинает
     * рисовать чужой лазерный след только при button === 'down' и обрывает его
     * на 'up' — потерянное переключение оставит след неначатым или незакрытым.
     */
    const buttonChanged = payload.button !== buttonSentRef.current
    const now = Date.now()
    if (!buttonChanged && now - pointerSentAtRef.current < POINTER_INTERVAL_MS) return

    pointerSentAtRef.current = now
    buttonSentRef.current = payload.button

    provider.setAwarenessField('pointer', payload.pointer)
    provider.setAwarenessField('button', payload.button)
  }, [])

  const handleChange = useCallback((
    elements: readonly ExcalidrawElement[],
    appState: { currentItemStrokeWidth: number; activeTool: { type: string } },
    files: BinaryFiles,
  ) => {
    // Слайдер показывается только у карандаша и должен отражать актуальное
    // значение, даже если толщину поменяли не им
    setStrokeWidth(appState.currentItemStrokeWidth)
    setActiveTool(appState.activeTool.type)

    if (isRemoteUpdateRef.current) return
    pendingRef.current = { elements, files }
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushLocalChanges()
    }, SYNC_INTERVAL_MS)
  }, [flushLocalChanges])

  /** Слайдер толщины: меняет и значение по умолчанию, и выделенные элементы */
  const handleStrokeWidthChange = useCallback((value: number) => {
    const api = apiRef.current
    setStrokeWidth(value)
    if (!api) return

    const selectedIds = api.getAppState().selectedElementIds
    const hasSelection = Object.keys(selectedIds).some((id) => selectedIds[id])

    if (!hasSelection) {
      api.updateScene({ appState: { currentItemStrokeWidth: value } })
      return
    }

    // Правку выделенных элементов нужно провести через version/versionNonce,
    // иначе синхронизация посчитает её отсутствием изменений
    const elements = api.getSceneElementsIncludingDeleted().map((el) => (
      selectedIds[el.id]
        ? {
          ...el,
          strokeWidth: value,
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
        } as ExcalidrawElement
        : el
    ))
    api.updateScene({ elements, appState: { currentItemStrokeWidth: value } })
  }, [])

  // Толщину слайдером задаём только карандашу — см. комментарий у портала ниже
  const showStrokeSlider = !readonly && activeTool === 'freedraw'

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

      {/**
        * Слайдер толщины живёт в секции «Stroke width» левой панели Excalidraw,
        * рядом с остальными свойствами инструмента. Показываем его только для
        * карандаша: у фигур остаётся штатный выбор из трёх значений, а у ластика
        * левой панели в Excalidraw 0.17 нет вовсе.
        */}
      {showStrokeSlider && strokeWidthSlot && createPortal(
        <label className="control-label">
          <input
            type="range"
            min={STROKE_WIDTH_MIN}
            max={STROKE_WIDTH_MAX}
            step={1}
            value={strokeWidth}
            onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
          />
        </label>,
        strokeWidthSlot,
      )}

      {/* Excalidraw занимает оставшееся пространство */}
      <div
        ref={canvasWrapRef}
        className={showStrokeSlider ? 'wb-stroke-slider' : undefined}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
            setStrokeWidth(api.getAppState().currentItemStrokeWidth)
            // Состояние могло приехать раньше, чем Excalidraw отдал API
            applyRemoteState()
          }}
          onChange={readonly ? undefined : handleChange}
          onPointerUpdate={handlePointerUpdate}
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
