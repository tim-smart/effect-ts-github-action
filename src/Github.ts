import { getOctokit } from "@actions/github"

// The Github service is a simple wrapper around the Octokit client

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
    Effect.tryCatchPromise(f(rest), (reason) => new GithubError(reason))

  const wrap =
    <A, Args extends any[]>(
      f: (_: Endpoints) => (...args: Args) => Promise<A>,
    ) =>
    (...args: Args) =>
      Effect.tryCatchPromise(
        () => f(rest)(...args),
        (reason) => new GithubError(reason),
      )

  return { api, token, request, wrap }
}

export interface Github extends ReturnType<typeof make> {}
export const Github = Tag<Github>()
export const makeLayer = (_: Config.Wrap<GithubOptions>) =>
  Config.unwrap(_).config.map(make).toLayer(Github)
