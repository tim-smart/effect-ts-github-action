import { MissingData } from "@effect/io/Config/Error"

export const nonEmptyString = (name: string) =>
  Config.string(name).mapOrFail(_ => {
    const trimmed = _.trim()
    return trimmed !== ""
      ? Either.right(trimmed)
      : Either.left(MissingData(Chunk.empty(), "must not be empty"))
  })

export const nonEmptySecret = (name: string) =>
  Config.secret(name).mapOrFail(_ => {
    const trimmed = ConfigSecret.fromString(_.value.trim())
    return trimmed.value !== ""
      ? Either.right(trimmed)
      : Either.left(MissingData(Chunk.empty(), "must not be empty"))
  })

export const input = (name: string) => nonEmptyString(name).nested("input")
export const inputSecret = (name: string) =>
  nonEmptySecret(name).nested("input")
