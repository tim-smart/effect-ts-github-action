import { Config, ConfigError, ConfigSecret, Either } from "effect"

export const nonEmptyString = (name: string) =>
  Config.string(name).pipe(
    Config.mapOrFail(_ => {
      const trimmed = _.trim()
      return trimmed !== ""
        ? Either.right(trimmed)
        : Either.left(ConfigError.MissingData([], "must not be empty"))
    }),
  )

export const nonEmptySecret = (name: string) =>
  Config.secret(name).pipe(
    Config.mapOrFail(_ => {
      const trimmed = ConfigSecret.fromString(ConfigSecret.value(_).trim())
      return ConfigSecret.value(trimmed) !== ""
        ? Either.right(trimmed)
        : Either.left(ConfigError.MissingData([], "must not be empty"))
    }),
  )

export const input = (name: string) =>
  Config.nested(nonEmptyString(name), "input")
export const inputSecret = (name: string) =>
  Config.nested(nonEmptySecret(name), "input")
