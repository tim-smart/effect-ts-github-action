import { getOctokit } from "@actions/github"
import type { OctokitResponse } from "@octokit/types"
import type { Option } from "@effect/data/Option"

export interface GithubOptions {
  token: ConfigSecret
}

export class GithubError {
  readonly _tag = "GithubError"
  constructor(readonly reason: unknown) {}
}

const make = ({ token }: GithubOptions) => {
  const api = getOctokit(token.value)

  const rest = api.rest
  type Endpoints = typeof rest

  const request = <A>(f: (_: Endpoints) => Promise<A>) =>
    Effect.tryCatchPromise(f(rest), reason => new GithubError(reason))

  const wrap =
    <A, Args extends any[]>(
      f: (_: Endpoints) => (...args: Args) => Promise<OctokitResponse<A>>,
    ) =>
    (...args: Args) =>
      Effect.tryCatchPromise(
        () => f(rest)(...args),
        reason => new GithubError(reason),
      ).map(_ => _.data)

  const stream = <A>(
    f: (_: Endpoints, page: number) => Promise<OctokitResponse<A[]>>,
  ) =>
    Stream.paginateChunkEffect(0, page =>
      Effect.tryCatchPromise(
        () => f(rest, page),
        reason => new GithubError(reason),
      ).map(_ => [
        Chunk.fromIterable(_.data),
        maybeNextPage(page, _.headers.link),
      ]),
    )

  return { api, token, request, wrap, stream }
}

export interface Github extends ReturnType<typeof make> {}
export const Github = Tag<Github>()
export const makeLayer = (_: Config.Wrap<GithubOptions>) =>
  Config.unwrap(_).config.map(make).toLayer(Github)

const maybeNextPage = (page: number, linkHeader?: string) =>
  Option.fromNullable(linkHeader)
    .filter(_ => _.includes(`rel=\"next\"`))
    .as(page + 1)
