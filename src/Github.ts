import { getOctokit } from "@actions/github"
import type { OctokitResponse } from "@octokit/types"
import {
  Chunk,
  Config,
  ConfigSecret,
  Context,
  Effect,
  Layer,
  Option,
  Stream,
} from "effect"

export interface GithubOptions {
  readonly token: ConfigSecret.ConfigSecret
}

export class GithubError {
  readonly _tag = "GithubError"
  constructor(readonly reason: unknown) {}
}

const make = ({ token }: GithubOptions) => {
  const api = getOctokit(ConfigSecret.value(token))

  const rest = api.rest
  type Endpoints = typeof rest

  const request = <A>(f: (_: Endpoints) => Promise<A>) =>
    Effect.tryPromise({
      try: () => f(rest),
      catch: reason => new GithubError(reason),
    })

  const wrap =
    <A, Args extends any[]>(
      f: (_: Endpoints) => (...args: Args) => Promise<OctokitResponse<A>>,
    ) =>
    (...args: Args) =>
      Effect.map(
        Effect.tryPromise({
          try: () => f(rest)(...args),
          catch: reason => new GithubError(reason),
        }),
        _ => _.data,
      )

  const stream = <A>(
    f: (_: Endpoints, page: number) => Promise<OctokitResponse<A[]>>,
  ) =>
    Stream.paginateChunkEffect(0, page =>
      Effect.tryPromise({
        try: () => f(rest, page),
        catch: reason => new GithubError(reason),
      }).pipe(
        Effect.map(_ => [
          Chunk.fromIterable(_.data),
          maybeNextPage(page, _.headers.link),
        ]),
      ),
    )

  return { api, token, request, wrap, stream } as const
}

export interface Github extends ReturnType<typeof make> {}
export const Github = Context.Tag<Github>()
export const layer = (_: Config.Config.Wrap<GithubOptions>) =>
  Effect.config(Config.unwrap(_)).pipe(Effect.map(make), Layer.effect(Github))

const maybeNextPage = (page: number, linkHeader?: string) =>
  Option.fromNullable(linkHeader).pipe(
    Option.filter(_ => _.includes(`rel=\"next\"`)),
    Option.as(page + 1),
  )
