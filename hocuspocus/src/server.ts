import * as Y from 'yjs'
import { Server, onAuthenticatePayload, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server'
import { Redis } from '@hocuspocus/extension-redis'
import { validateAccess, loadYjsState, saveYjsState } from './api.js'
import type { ConnectionContext } from './types.js'

const PORT = parseInt(process.env.HOCUSPOCUS_PORT ?? '1234', 10)
const REDIS_HOST = process.env.REDIS_HOST ?? 'redis'
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10)

// Имя документа = room_id урока (UUID), передаётся клиентом при подключении
const server = Server.configure({
  port: PORT,

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
    } else {
      console.log(`[persistence] Новая комната ${documentName}, состояние пустое`)
    }
    return document
  },

  /**
   * onStoreDocument — вызывается когда все клиенты отключились от документа.
   * Сохраняем финальное Yjs-состояние в Django.
   */
  async onStoreDocument({ documentName, document }: onStoreDocumentPayload): Promise<void> {
    const update = Y.encodeStateAsUpdate(document)
    const base64State = Buffer.from(update).toString('base64')
    await saveYjsState(documentName, base64State)
    console.log(`[persistence] Состояние сохранено для комнаты ${documentName}`)
  },

  extensions: [
    new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      // Используем отдельную DB (2) чтобы не конфликтовать с Django Channels (0) и Celery (1)
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
