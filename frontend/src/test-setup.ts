import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Компоненты монтируются в общий document — без уборки следующий тест найдёт
// разметку предыдущего и тихо пройдёт не по тому узлу
afterEach(cleanup)
