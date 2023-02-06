import { MissingData } from "@effect/io/Config/Error"

export const nonEmptyString = (name: string) =>
  Config.string(name).mapOrFail((_) => {
    const trimmed = _.trim()
    return trimmed !== ""
      ? Either.right(trimmed)
      : Either.left(MissingData(Chunk.empty(), "must not be empty"))
  })
