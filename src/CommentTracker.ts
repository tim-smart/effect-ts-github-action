import type { Option } from "@fp-ts/core/Option"
import { Github, GithubError } from "./Github.js"
import { RunnerEnv, RunnerEnvLive } from "./Runner.js"

/**
 * CommentTracker is for upserting comments to an issue or PR on Github.
 *
 * It also supports adding custom metadata from an fp-ts/schema/Schema
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
 * const { Tag: CommentTracker, Live: LiveCommentTracker } = makeLayer("DeploymentService", metadataSchema)
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

const make = <A>(tag: string, schema: Schema<A>) =>
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
            Option.fromThrowable(JSON.parse(metaJson)).flatMapEither(_ =>
              schema.decode(_, { isUnexpectedAllowed: true }),
            ),
          )

          return [_, meta] as const
        }),
      )
      .flatMap(_ => _.match(() => Stream.empty, Stream.succeed)).runHead

    const commentMeta = (meta: A) => {
      const encoded = schema.encodeOrThrow(meta)
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

export const makeLayer = <A>(tag: string, schema: Schema<A>) => {
  const serviceTag = Tag<CommentTracker<A>>()
  const Live = RunnerEnvLive >> make(tag, schema).toLayer(serviceTag)

  return {
    Tag: serviceTag,
    Live,
  } as const
}
