/**
 * Телефон вводится в российском формате: +7 999 000-00-00.
 *
 * Код региона стоит в поле с самого начала — так понятнее, что от тебя ждут,
 * и не приходится гадать, писать ли «8» или «+7». Бэкенд всё равно оставляет
 * от номера одни цифры (`normalize_phone`), поэтому разделители тут только
 * для чтения и на сравнение не влияют.
 */

/** Цифр в номере без кода страны */
const LENGTH = 10

/**
 * Сам номер, без кода страны: «+7 999 123-45-67» → «9991234567».
 *
 * Значение из самого поля всегда начинается с «+»: эту семёрку поле рисует
 * само, и в номер она не входит. Пришедшее со стороны (телефон, который
 * преподаватель вписал заранее) может быть в любом виде, поэтому там первую
 * цифру не трогаем.
 *
 * Отдельно — набранное или вставленное целиком, вместе с кодом («8999…»,
 * «+7999…»): цифр становится на одну больше положенного, и лишний код с
 * начала убираем. Обрезать хвост вместо этого нельзя — потеряются последние
 * цифры, а заметить это в маске трудно.
 */
export function phoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  let rest = raw.trimStart().startsWith('+') ? digits.slice(1) : digits
  if (rest.length > LENGTH && (rest[0] === '7' || rest[0] === '8')) {
    rest = rest.slice(1)
  }
  return rest.slice(0, LENGTH)
}

export function maskPhone(raw: string): string {
  const digits = phoneDigits(raw)
  let out = '+7'
  if (digits.length) out += ` ${digits.slice(0, 3)}`
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`
  return out
}

/** Пустое поле показывает «+7», поэтому «непусто» и «введён» — разные вещи */
export function isPhoneComplete(raw: string): boolean {
  return phoneDigits(raw).length === LENGTH
}
