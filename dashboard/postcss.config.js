// Tailwind 4: плагин переехал в отдельный пакет, autoprefixer больше не нужен —
// префиксы Tailwind расставляет сам.
module.exports = {
  plugins: { '@tailwindcss/postcss': {} },
}
