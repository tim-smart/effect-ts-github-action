import * as ParseResult from "@effect/schema/ParseResult"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { Github, GithubError } from "./Github.js"
import { RunnerEnv, RunnerEnvLive } from "./Runner.js"
import { Schema } from "./_common.js"

/**
 * CommentTracker is for upserting comments to an issue or PR on Github.
 *
 * It also supports adding custom metadata from an effect/schema/Schema
 *
 * Usage:
 *
 * ```ts
 * import { makeLayer } from "./CommentTracker"
 *
 * const metadataSchema = Schema.struct({
 *   deploymentId: Schema.string
 * })
 *
 * const { CommentTracker, LiveCommentTracker } = makeLayer("DeploymentService", metadataSchema)
 *
 * const makeDeploymentService = Do($ => {
 *   const tracker = $(Effect.service(CommentTracker))
 *
 *   $(tracker.upsert((previousMetadata) => Do($ => {
 *     // TODO: Maybe do something with previous metadata
 *     return [`Markdown to go into the comment body`, { deploymentId: "123" }, void 0] as const
 *   })))
 * })
 * ```
 */
export interface CommentTracker<M> {
  readonly upsert: <R, E, A>(
    create: (
      previousMetadata: Option.Option<M>,
    ) => Effect.Effect<R, E, readonly [body: string, meta: M, a: A]>,
  ) => Effect.Effect<
    R,
    E | IssueNotFound | GithubError | ParseResult.ParseError,
    A
  >
}

export class IssueNotFound {
  readonly _tag = "IssueNotFound"
}

const metaRegex = /<!-- CommentTracker\((\w+?)\) (\S+) -->/

const jsonParse = Option.liftThrowable(JSON.parse)

const make = <I, A>(tag: string, schema: Schema.Schema<I, A>) =>
  Effect.gen(function* (_) {
    const env = yield* _(RunnerEnv)
    const gh = yield* _(Github)
    const parse = Schema.parse(schema)
    const encode = Schema.encode(schema)

    const issueEffect = Effect.mapError(env.issue, () => new IssueNotFound())

    const issueComments = Stream.flatMap(issueEffect, issue =>
      gh.stream((_, page) =>
        _.issues.listComments({
          page,
          owner: issue.owner,
          repo: issue.repo,
          issue_number: issue.number,
        }),
      ),
    )

    const findComment = issueComments.pipe(
      Stream.flatMap(_ =>
        Option.fromNullable(_.body?.match(metaRegex)).pipe(
          Option.bindTo("match"),
          Option.let("tagRaw", ({ match }) => match[1]),
          Option.let("metaRaw", ({ match }) => match[2]),
          Option.filter(({ tagRaw }) => tagRaw === tag),
          Option.flatMap(({ metaRaw }) =>
            jsonParse(Buffer.from(metaRaw, "base64").toString()),
          ),
          Effect.flatMap(parse),
          Effect.map(meta => [_, meta] as const),
          Stream.catchAll(() => Stream.empty),
        ),
      ),
      Stream.runHead,
    )

    const commentMeta = (meta: A) =>
      encode(meta).pipe(
        Effect.map(encoded => {
          const b64Meta = Buffer.from(JSON.stringify(encoded)).toString(
            "base64",
          )
          return `<!-- CommentTracker(${tag}) ${b64Meta} -->`
        }),
      )

    const commentBody = (body: string, meta: A) =>
      Effect.map(commentMeta(meta), meta => `${meta}\n${body}`)

    const createComment = (body: string, meta: A) =>
      Effect.all([issueEffect, commentBody(body, meta)]).pipe(
        Effect.flatMap(([issue, body]) =>
          gh.request(_ =>
            _.issues.createComment({
              owner: issue.owner,
              repo: issue.repo,
              issue_number: issue.number,
              body,
            }),
          ),
        ),
      )

    const updateComment = (id: number, body: string, meta: A) =>
      Effect.all([issueEffect, commentBody(body, meta)]).pipe(
        Effect.flatMap(([issue, body]) =>
          gh.request(_ =>
            _.issues.updateComment({
              owner: issue.owner,
              repo: issue.repo,
              comment_id: id,
              body,
            }),
          ),
        ),
      )

    const upsert = <R, E, T>(
      create: (
        _: Option.Option<A>,
      ) => Effect.Effect<R, E, readonly [body: string, meta: A, a: T]>,
    ) =>
      Effect.gen(function* (_) {
        const prev = yield* _(findComment)
        const [body, meta, ret] = yield* _(
          create(Option.map(prev, ([, meta]) => meta)),
        )

        return yield* _(
          Option.match(prev, {
            onNone: () => Effect.asUnit(createComment(body, meta)),
            onSome: ([comment]) =>
              Effect.asUnit(updateComment(comment.id, body, meta)),
          }),
          Effect.as(ret),
        )
      })

    return { upsert } satisfies CommentTracker<A>
  })

export const makeLayer = <I, A>(tag: string, schema: Schema.Schema<I, A>) => {
  const CommentTracker = Context.Tag<CommentTracker<A>>()
  const LiveCommentTracker = Layer.effect(
    CommentTracker,
    make(tag, schema),
  ).pipe(Layer.use(RunnerEnvLive))

  return {
    CommentTracker,
    LiveCommentTracker,
  } as const
}
