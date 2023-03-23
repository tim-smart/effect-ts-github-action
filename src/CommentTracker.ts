import type { Option } from "@effect/data/Option"
import { Github, GithubError } from "./Github.js"
import { RunnerEnv, RunnerEnvLive } from "./Runner.js"

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
      previousMetadata: Option<M>,
    ) => Effect<R, E, readonly [body: string, meta: M, a: A]>,
  ) => Effect<R, E | IssueNotFound | GithubError, A>
}

export class IssueNotFound {
  readonly _tag = "IssueNotFound"
}

const metaRegex = /<!-- CommentTracker\((\w+?)\) (\S+) -->/

const jsonParse = Option.liftThrowable(JSON.parse)

const make = <I extends Json, A>(tag: string, schema: Schema<I, A>) =>
  Do(($): CommentTracker<A> => {
    const env = $(RunnerEnv.access)
    const gh = $(Github.access)

    const issueEffect = env.issue.match(
      Effect.fail(new IssueNotFound()),
      Effect.succeed,
    )

    const issueComments = Stream.fromEffect(issueEffect).flatMap(issue =>
      gh.stream((_, page) =>
        _.issues.listComments({
          page,
          owner: issue.owner,
          repo: issue.repo,
          issue_number: issue.number,
        }),
      ),
    )

    const findComment = issueComments
      .map(_ =>
        Do($ => {
          const [, tagRaw, metaRaw] = $(
            Option.fromNullable(_.body?.match(metaRegex)),
          )

          // Make sure tag matches
          $(Option.some(tagRaw).filter(_ => _ === tag))

          const metaJson = Buffer.from(metaRaw, "base64").toString()
          const meta = $(
            jsonParse(metaJson).flatMapEither(_ =>
              schema.parseEither(_, { isUnexpectedAllowed: true }),
            ),
          )

          return [_, meta] as const
        }),
      )
      .flatMap(_ => _.match(() => Stream.empty, Stream.succeed)).runHead

    const commentMeta = (meta: A) => {
      const encoded = schema.encode(meta)
      const b64Meta = Buffer.from(JSON.stringify(encoded)).toString("base64")
      return `<!-- CommentTracker(${tag}) ${b64Meta} -->`
    }

    const commentBody = (body: string, meta: A) =>
      `${commentMeta(meta)}\n${body}`

    const createComment = (body: string, meta: A) =>
      issueEffect.flatMap(issue =>
        gh.request(_ =>
          _.issues.createComment({
            owner: issue.owner,
            repo: issue.repo,
            issue_number: issue.number,
            body: commentBody(body, meta),
          }),
        ),
      )

    const updateComment = (id: number, body: string, meta: A) =>
      issueEffect.flatMap(issue =>
        gh.request(_ =>
          _.issues.updateComment({
            owner: issue.owner,
            repo: issue.repo,
            comment_id: id,
            body: commentBody(body, meta),
          }),
        ),
      )

    const upsert = <R, E, T>(
      create: (
        _: Option<A>,
      ) => Effect<R, E, readonly [body: string, meta: A, a: T]>,
    ) =>
      Do($ => {
        const prev = $(findComment)
        const [body, meta, _] = $(create(prev.map(([, meta]) => meta)))

        return $(
          prev
            .match(
              () => createComment(body, meta).asUnit,
              ([comment]) => updateComment(comment.id, body, meta).asUnit,
            )
            .as(_),
        )
      })

    return { upsert }
  })

export const makeLayer = <I extends Json, A>(
  tag: string,
  schema: Schema<I, A>,
) => {
  const CommentTracker = Tag<CommentTracker<A>>()
  const LiveCommentTracker =
    RunnerEnvLive >> make(tag, schema).toLayer(CommentTracker)

  return {
    CommentTracker,
    LiveCommentTracker,
  } as const
}
