// Excalidraw ищет здесь свои шрифты и переводы; по умолчанию он тянет их
// с unpkg, а нам нужна работа без внешней сети (см. vite.config.ts).
// Лежит отдельным файлом, а не inline в index.html: CSP в проде запрещает
// inline-скрипты (см. nginx/templates/default.conf.template).
window.EXCALIDRAW_ASSET_PATH = '/'
