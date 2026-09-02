/**
 * Иконки инструментов из макета «Доска — новый дизайн».
 *
 * Excalidraw рисует свои, поэтому содержимое кнопок подменяется на эти —
 * см. applyToolbarSkin в WhiteboardRoom. Хранятся строками, а не JSX: их
 * приходится вставлять в чужой DOM, которым React не управляет.
 */

/** Контуры внутри viewBox 24×24, обводка — currentColor */
export const TOOL_ICON_PATHS: Record<string, string> = {
  hand:
    '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>'
    + '<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/>'
    + '<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/>'
    + '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  selection:
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  freedraw:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'
    + '<path d="m15 5 4 4"/>',
  eraser:
    '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>'
    + '<path d="M22 21H7"/><path d="m5 11 9 9"/>',
  line: '<path d="M5 12h14"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  shapes:
    '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/>'
    + '<circle cx="17" cy="17" r="5"/><rect width="9" height="9" x="2" y="13" rx="1"/>',
  text: '<path d="M12 4v16"/><path d="M4 7V4h16v3"/><path d="M9 20h6"/>',
  image:
    '<rect width="20" height="20" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/>'
    + '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  laser:
    '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>'
    + '<path d="M17.8 11.8 19 13"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  zoomOut: '<path d="M5 12h14"/>',
  zoomIn: '<path d="M5 12h14"/><path d="M12 5v14"/>',

  // Формы внутри выпадающего списка «Фигуры» — в макете отдельных иконок нет,
  // поэтому взяты простейшие, в том же стиле
  rectangle: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  diamond: '<path d="M12 2.7 21.3 12 12 21.3 2.7 12z"/>',
  ellipse: '<circle cx="12" cy="12" r="9"/>',
}

/** Инструменты, которым подменяем иконку прямо в кнопке Excalidraw */
export const TOOLBAR_ICON_BY_TESTID: Record<string, string> = {
  'toolbar-hand': 'hand',
  'toolbar-selection': 'selection',
  'toolbar-freedraw': 'freedraw',
  'toolbar-eraser': 'eraser',
  'toolbar-line': 'line',
  'toolbar-arrow': 'arrow',
  'toolbar-text': 'text',
  'toolbar-image': 'image',
}

export function iconMarkup(name: string, size = 20): string {
  return `<svg data-wb-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"`
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    + ` style="display:block;flex:none">${TOOL_ICON_PATHS[name]}</svg>`
}
