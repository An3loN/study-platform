import * as Y from 'yjs'
import { Server, onAuthenticatePayload, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server'
import { Redis } from '@hocuspocus/extension-redis'
import { validateAccess, loadYjsState, saveYjsState } from './api.js'
import { pruneUnusedFilesIfIdle } from './cleanup.js'
import type { ConnectionContext } from './types.js'

const PORT = parseInt(process.env.HOCUSPOCUS_PORT ?? '1234', 10)
const REDIS_HOST = process.env.REDIS_HOST ?? 'redis'
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10)

// Имя документа = room_id урока (UUID), передаётся клиентом при подключении
const server = Server.configure({
  port: PORT,

  // Как часто сохранять документ во время урока: через 5 секунд тишины, но
  // не реже раза в 30 секунд непрерывной работы. Каждое сохранение пишет
  // документ целиком, вместе с картинками, — по умолчанию (2 и 10 секунд)
  // это мегабайты в Postgres каждые несколько секунд. При уходе последнего
  // участника сохраняется сразу, так что теряется самое большее полминуты —
  // и только если упадёт сам Hocuspocus.
  debounce: 5_000,
  maxDebounce: 30_000,

  /**
   * onAuthenticate — вызывается при каждом новом WS-подключении.
   * token  — JWT из query-параметра ?token=
   * documentName — room_id урока
   *
   * Выбрасываем ошибку → Hocuspocus закрывает соединение с кодом 4403.
   */
  async onAuthenticate({ token, documentName }: onAuthenticatePayload): Promise<ConnectionContext> {
    if (!token) {
      throw new Error('JWT-токен обязателен.')
    }
    const user = await validateAccess(token, documentName)
    console.log(`[auth] ${user.username} (${user.role}) подключился к комнате ${documentName}`)
    return { user }
  },

  /**
   * onLoadDocument — вызывается один раз при первом подключении к документу.
   * Восстанавливаем Yjs-состояние из Django.
   */
  async onLoadDocument({ documentName, document }: onLoadDocumentPayload): Promise<Y.Doc> {
    const base64State = await loadYjsState(documentName)
    if (base64State) {
      const update = Buffer.from(base64State, 'base64')
      Y.applyUpdate(document, update)
      console.log(`[persistence] Состояние загружено для комнаты ${documentName}`)
      // Первый клиент ещё не подключён — комната пуста, чистить можно. Здесь
      // чистка гарантирована: при уходе последнего она случается, только если
      // оставалось несохранённое, а после тихого конца урока его нет
      const removed = pruneUnusedFilesIfIdle(document)
      if (removed > 0) {
        console.log(`[cleanup] ${documentName}: при загрузке удалено ненужных картинок — ${removed}`)
      }
    } else {
      console.log(`[persistence] Новая комната ${documentName}, состояние пустое`)
    }
    return document
  },

  /**
   * onStoreDocument — через 5–30 секунд после правок (debounce выше) и
   * сразу, когда отключился последний клиент. Сохраняем Yjs-состояние в Django.
   */
  async onStoreDocument({ documentName, document }: onStoreDocumentPayload): Promise<void> {
    const sizeBefore = Y.encodeStateAsUpdate(document).length
    // Картинки чистим только в пустой комнате: посреди урока их ещё может
    // вернуть Ctrl+Z (см. cleanup.ts)
    const removed = pruneUnusedFilesIfIdle(document)

    const update = Y.encodeStateAsUpdate(document)
    if (removed > 0) {
      const freed = sizeBefore - update.length
      console.log(
        `[cleanup] ${documentName}: удалено ненужных картинок — ${removed}, освобождено ${Math.round(freed / 1024)} КБ`,
      )
    }
    const base64State = Buffer.from(update).toString('base64')
    const saved = await saveYjsState(documentName, base64State)
    if (saved) {
      console.log(`[persistence] Состояние сохранено для комнаты ${documentName}`)
    } else {
      console.error(`[persistence] СОСТОЯНИЕ ПОТЕРЯНО для комнаты ${documentName}`)
    }
  },

  extensions: [
    new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      // Отдельная DB (2): в 1 очередь Celery, в 3 кеш Django
      options: { db: 2 },
    }),
  ],
})

server.listen().then(() => {
  console.log(`Hocuspocus запущен на порту ${PORT}`)
}).catch((err: unknown) => {
  console.error('Ошибка запуска Hocuspocus:', err)
  process.exit(1)
})
