import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

/**
 * Окно закрывается тремя способами, и все три легко потерять при правке
 * разметки. Особенно клик по подложке: остановка всплытия внутри окна — то,
 * что отличает «закрыть» от «закрывается, стоит тронуть поле».
 */

describe('Modal', () => {
  it('показывает заголовок, пояснение и содержимое', () => {
    render(
      <Modal title="Новый урок" description="Время можно не заполнять" onClose={vi.fn()}>
        <p>тело окна</p>
      </Modal>,
    )

    expect(screen.getByRole('heading', { name: 'Новый урок' })).toBeInTheDocument()
    expect(screen.getByText('Время можно не заполнять')).toBeInTheDocument()
    expect(screen.getByText('тело окна')).toBeInTheDocument()
  })

  it('обходится без пояснения', () => {
    render(<Modal title="Удалить урок" onClose={vi.fn()}>тело</Modal>)

    expect(screen.getByRole('heading', { name: 'Удалить урок' })).toBeInTheDocument()
  })

  it('закрывается крестиком', async () => {
    const onClose = vi.fn()
    render(<Modal title="Окно" onClose={onClose}>тело</Modal>)

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('закрывается по Escape', async () => {
    const onClose = vi.fn()
    render(<Modal title="Окно" onClose={onClose}>тело</Modal>)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('закрывается кликом по подложке', async () => {
    const onClose = vi.fn()
    const { container } = render(<Modal title="Окно" onClose={onClose}>тело</Modal>)

    await userEvent.click(container.querySelector('.dialog')!)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('не закрывается кликом внутри окна', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Окно" onClose={onClose}>
        <input placeholder="поле" />
      </Modal>,
    )

    await userEvent.click(screen.getByPlaceholderText('поле'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('снимает обработчик Escape при размонтировании', async () => {
    const onClose = vi.fn()
    const { unmount } = render(<Modal title="Окно" onClose={onClose}>тело</Modal>)

    unmount()
    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})
